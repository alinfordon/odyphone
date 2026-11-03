import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { bearer, createTestApp, registerOwner } from "./harness.js";

let harness;
let app;
let owner;

before(async () => {
  harness = await createTestApp();
  app = harness.app;
  owner = await registerOwner(app);
}, { timeout: 180000 });

after(async () => {
  await harness?.stop();
});

function fakeAri() {
  const calls = [];
  return {
    calls,
    async hangup(id, code) {
      calls.push(["hangup", id, code]);
      return { executed: true, live: false };
    },
    async ring() {
      return { executed: true, live: false };
    },
    async stopRing() {
      return { executed: true, live: false };
    },
    async originate(body) {
      calls.push(["originate", body.endpoint]);
      return { executed: true, channelId: "out.1", live: false };
    },
    async createBridge() {
      return { executed: true, id: "bridge.1", live: false };
    },
    async addToBridge() {
      calls.push(["bridge"]);
      return { executed: true, live: false };
    },
    async destroyBridge() {
      return { executed: true, live: false };
    },
    async answer() {
      calls.push(["answer"]);
      return { executed: true, live: true };
    },
  };
}

test("simulated lifecycle is stored and never marked live", async () => {
  const response = await request(app)
    .post("/api/v1/telephony/simulate")
    .set(bearer(owner.token))
    .send({ phoneNumber: "+40730000000" });
  assert.equal(response.status, 201);
  assert.equal(response.body.data.simulated, true);
  assert.equal(response.body.data.liveCall, false);
  assert.equal(response.body.data.telephonyExecuted, false);
  assert.equal(response.body.data.call.simulated, true);
  assert.equal(response.body.data.call.execution, "not_executed");
  assert.equal(response.body.data.call.liveCall, false);
  const listed = await request(app).get("/api/v1/calls").set(bearer(owner.token));
  assert.equal(listed.body.data.some((call) => call.id === response.body.data.call.id), false);
});

test("a real AI decision closes the channel and does not answer it", async () => {
  await request(app).patch("/api/v1/settings").set(bearer(owner.token)).send({
    aiAnsweringEnabled: true,
    answerUnknownCallers: true,
  });
  await request(app).post("/api/v1/rules").set(bearer(owner.token)).send({
    name: "Necunoscuți AI",
    priority: 10,
    matchType: "unknown",
    action: "ai_answer",
    fallbackAction: "ignore",
  });
  const { handleInboundStasis } = await import("../src/telephony/callDispatcher.js");
  const ari = fakeAri();
  const result = await handleInboundStasis({
    channel: { id: "in.ai", caller: { number: "+40730111222" } },
    userId: owner.user.id,
    ari,
    sessions: new Map(),
  });
  assert.equal(ari.calls.some((entry) => entry[0] === "answer"), false);
  assert.deepEqual(ari.calls[0], ["hangup", "in.ai", 16]);
  assert.equal(result.call.callStatus, "missed");
  assert.equal(result.call.aiHandled, false);
  assert.equal(result.call.execution, "channel_closed");
  assert.equal(result.live, false);
  assert.equal(result.answered, false);
});

test("ring owner dials only through the configured trunk template", async () => {
  await request(app).post("/api/v1/contacts").set(bearer(owner.token)).send({
    name: "Maria",
    phoneNumber: "+40722111000",
    category: "Family",
    aiEnabled: false,
    priority: 10,
  });
  const { handleInboundStasis } = await import("../src/telephony/callDispatcher.js");
  const withoutTrunk = fakeAri();
  const blocked = await handleInboundStasis({
    channel: { id: "in.block", caller: { number: "+40722111000" } },
    userId: owner.user.id,
    ari: withoutTrunk,
    ownerNumber: "+40721110000",
    sessions: new Map(),
  });
  assert.equal(withoutTrunk.calls.some((entry) => entry[0] === "originate"), false);
  assert.equal(blocked.call.callStatus, "missed");
  assert.equal(blocked.answered, false);

  const withTrunk = fakeAri();
  const sessions = new Map();
  const pending = await handleInboundStasis({
    channel: { id: "in.dial", caller: { number: "+40722111000" } },
    userId: owner.user.id,
    ari: withTrunk,
    trunkTemplate: "PJSIP/{number}@ody-trunk",
    ownerNumber: "+40 721 110 000",
    sessions,
  });
  assert.equal(pending.pending, true);
  assert.equal(pending.answered, false);
  assert.equal(withTrunk.calls.some((entry) => entry[0] === "hangup"), false);
  assert.equal(withTrunk.calls.some((entry) => entry[0] === "originate" && entry[1] === "PJSIP/40721110000@ody-trunk"), true);
});

test("simulator refuses to run outside development mode", async () => {
  const { resetEnvCache } = await import("../src/config/env.js");
  process.env.PHONE_AI_DEVELOPMENT_MODE = "false";
  resetEnvCache();
  try {
    const response = await request(app)
      .post("/api/v1/telephony/simulate")
      .set(bearer(owner.token))
      .send({ phoneNumber: "+40730000000" });
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, "SIMULATOR_DISABLED");
  } finally {
    process.env.PHONE_AI_DEVELOPMENT_MODE = "true";
    resetEnvCache();
  }
});

test("a ready voice path answers only after AudioSocket media exists", async () => {
  const { beginIncomingCall } = await import("../src/services/callService.js");
  const { connectAiVoice } = await import("../src/audio/voiceBridge.js");
  const { PhoneCall } = await import("../src/models/PhoneCall.js");
  const started = await beginIncomingCall({ userId: owner.user.id, callerNumber: "+40740111000" });
  const trace = [];
  const sessions = new Map();
  const result = await connectAiVoice({
    ari: {
      async externalMedia() {
        trace.push("media");
        return { executed: true, channelId: "ext.9" };
      },
      async answer() {
        trace.push("answer");
        return { executed: true };
      },
      async createBridge() {
        return { executed: true, id: "br.9" };
      },
      async addToBridge() {
        trace.push("add");
        return { executed: true };
      },
      async hangup() {
        trace.push("hangup");
        return { executed: true };
      },
      async destroyBridge() {
        return { executed: true };
      },
    },
    channelId: "in.voice",
    userId: owner.user.id,
    call: started.call,
    sessions,
    deps: {
      runtime: { host: "127.0.0.1", port: 9019, hold() {}, release() {} },
      tts: { async synthesize() { return { pcm: Buffer.alloc(320) }; } },
      stt: { async transcribe() { return { text: "" }; } },
      llm: { async generate() { throw new Error("modelul nu trebuie chemat pentru salut"); } },
    },
  });
  assert.equal(result.answered, true);
  assert.equal(result.call.toPublic().liveCall, true);
  assert.equal(result.call.aiHandled, started.call.ruleApplied.action === "ai_answer");
  assert.deepEqual(trace.slice(0, 2), ["media", "answer"]);
  await sessions.get("in.voice").finish("remote");
  const closed = await PhoneCall.findById(started.call._id);
  assert.equal(closed.callStatus, "completed");
  assert.equal(closed.toPublic().liveCall, false);
  assert.equal(closed.execution, "voice_session");
});
