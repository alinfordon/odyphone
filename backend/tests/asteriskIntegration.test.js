import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import request from "supertest";
import { applyAudioFrame, AUDIO_SOCKET, encodeFrame, isLoopbackHost, startAudioSocket } from "../src/audio/audioSocket.js";
import { voiceRuntime } from "../src/audio/voiceRuntime.js";
import { createAriEventConnection } from "../src/telephony/ariConnection.js";
import { classifyAriEvent } from "../src/telephony/ariEvents.js";
import { ariEventsUrl, isLoopbackAriUrl } from "../src/telephony/ariSafety.js";
import { activeSessionCount, closeLiveSession, openLiveSession, resetLiveSessions } from "../src/telephony/liveSessions.js";

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FakeSocket {
  constructor(url, options) {
    this.url = url;
    this.options = options;
    this.handlers = {};
    FakeSocket.sockets.push(this);
  }

  on(name, fn) {
    this.handlers[name] = fn;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.handlers.close?.();
  }
}

async function checkAriUrl() {
  assert.equal(isLoopbackAriUrl("http://127.0.0.1:8088/ari"), true);
  assert.equal(isLoopbackAriUrl("http://203.0.113.5:8088/ari"), false);
  assert.equal(ariEventsUrl("http://odyari:secret@127.0.0.1:8088/ari", "ody-phone"), "ws://127.0.0.1:8088/ari/events?app=ody-phone");
  assert.throws(() => ariEventsUrl("http://203.0.113.5:8088/ari", "ody-phone"), /localhost/);
}

async function checkAriFailure() {
  FakeSocket.sockets = [];
  let errors = 0;
  createAriEventConnection({
    WebSocketImpl: FakeSocket,
    initialDelay: 20,
    getTarget() {
      const error = new Error("ARI este permis doar pe localhost.");
      error.code = "ARI_NOT_LOOPBACK";
      throw error;
    },
    onError() {
      errors += 1;
    },
  });
  await wait(50);
  assert.equal(errors, 1);
  assert.equal(FakeSocket.sockets.length, 0);
}

async function checkAriReconnect() {
  FakeSocket.sockets = [];
  let opens = 0;
  const connection = createAriEventConnection({
    WebSocketImpl: FakeSocket,
    initialDelay: 20,
    getTarget: () => ({ url: "ws://127.0.0.1:8088/ari/events?app=ody-phone", authorization: "Basic hidden" }),
    onEvent() {},
    onOpen() {
      opens += 1;
    },
    onClose() {},
    onError() {},
  });
  FakeSocket.sockets[0].handlers.error(new Error("refused"));
  await wait(50);
  assert.equal(FakeSocket.sockets.length >= 2, true);
  assert.equal(FakeSocket.sockets[0].options.headers.Authorization, "Basic hidden");
  FakeSocket.sockets[1].handlers.open();
  assert.equal(opens, 1);
  connection.stop();
}

async function checkStasisSessions() {
  resetLiveSessions();
  assert.equal(classifyAriEvent({ type: "StasisStart", channel: { id: "ch.1" } }), "inbound");
  assert.equal(classifyAriEvent({ type: "StasisStart", channel: { id: "out.1" }, args: ["dialed", "ch.1"] }), "outbound");
  assert.equal(classifyAriEvent({ type: "StasisEnd", channel: { id: "ch.1" } }), "end");
  assert.equal(classifyAriEvent({ type: "ChannelDestroyed", channel: { id: "ch.1" } }), "end");
  assert.equal(classifyAriEvent({ type: "Other" }), "ignore");
  const first = openLiveSession({ channelId: "ch.1", callerId: "+40722111000" });
  const second = openLiveSession({ channelId: "ch.1", callerId: "+40722111000" });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(first.session.startedAt.length > 0, true);
  assert.equal(first.session.status, "stasis");
  assert.equal(first.session.audioSocket, "waiting");
  assert.equal(first.session.stasis, "started");
  assert.equal(activeSessionCount(), 1);
  closeLiveSession("ch.1");
  closeLiveSession("ch.1");
  assert.equal(activeSessionCount(), 0);
}

async function checkAudioSocket() {
  resetLiveSessions();
  voiceRuntime.pending.clear();
  voiceRuntime.active = 0;
  const heard = new Map();
  const hung = [];
  for (const id of ["aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "11111111-2222-3333-4444-555555555555"]) {
    voiceRuntime.hold(id, {
      bind() {},
      async onAudio(payload) {
        heard.set(id, (heard.get(id) || 0) + payload.length);
      },
      async onRemoteHangup() {
        hung.push(id);
      },
    });
  }
  const refused = startAudioSocket({ force: true, host: "0.0.0.0", port: 0 });
  assert.equal(voiceRuntime.listening, false);
  refused.stop();
  const started = startAudioSocket({ force: true, host: "127.0.0.1", port: 0 });
  for (let attempt = 0; attempt < 30 && !voiceRuntime.listening; attempt += 1) {
    await wait(10);
  }
  assert.equal(isLoopbackHost(voiceRuntime.host), true);
  assert.equal(voiceRuntime.host, "127.0.0.1");

  function connect() {
    const socket = net.connect(voiceRuntime.port, "127.0.0.1");
    return new Promise((resolve, reject) => {
      socket.once("connect", () => resolve(socket));
      socket.once("error", reject);
    });
  }
  const first = await connect();
  const second = await connect();
  const uuid = (value) => encodeFrame(AUDIO_SOCKET.UUID, Buffer.from(value.replace(/-/g, ""), "hex"));
  first.write(uuid("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"));
  first.write(encodeFrame(AUDIO_SOCKET.SLIN_8K, Buffer.alloc(320)));
  first.write(encodeFrame(AUDIO_SOCKET.DTMF, Buffer.from([49])));
  second.write(uuid("11111111-2222-3333-4444-555555555555"));
  const split = encodeFrame(AUDIO_SOCKET.SLIN_8K, Buffer.alloc(160));
  second.write(split.subarray(0, 2));
  second.write(split.subarray(2));
  const stranger = await connect();
  stranger.write(encodeFrame(AUDIO_SOCKET.UUID, Buffer.alloc(16)));
  stranger.write(encodeFrame(AUDIO_SOCKET.SLIN_8K, Buffer.alloc(10)));
  await wait(80);
  assert.equal(heard.get("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"), 320);
  assert.equal(heard.get("11111111-2222-3333-4444-555555555555"), 160);
  assert.equal(heard.has("00000000-0000-0000-0000-000000000000"), false);
  assert.equal(applyAudioFrame({ type: 0x11, payload: Buffer.alloc(4), session: {} }), "other-rate");
  assert.equal(applyAudioFrame({ type: AUDIO_SOCKET.DTMF, payload: Buffer.from([49]), session: {} }), "dtmf");
  first.write(encodeFrame(AUDIO_SOCKET.ERROR, Buffer.alloc(0)));
  second.end();
  await wait(80);
  started.stop();
  voiceRuntime.listening = false;
  voiceRuntime.pending.clear();
  first.destroy();
  second.destroy();
  stranger.destroy();
  assert.equal(hung.length, 2);
  assert.equal(voiceRuntime.active, 0);
}

async function checkHealth() {
  process.env.LOG_LEVEL = "silent";
  const { resetEnvCache } = await import("../src/config/env.js");
  const { resetAsteriskCache } = await import("../src/services/statusService.js");
  resetEnvCache();
  resetAsteriskCache();
  const { createApp } = await import("../src/app.js");
  const response = await request(createApp()).get("/api/v1/health");
  assert.equal(response.status, 200);
  const body = response.body.data;
  assert.equal(body.api, "up");
  assert.equal(typeof body.ari.connected, "boolean");
  assert.equal(typeof body.audioSocket.listening, "boolean");
  assert.equal(typeof body.asterisk.reachable, "boolean");
  assert.equal(typeof body.sessions.active, "number");
  const serialized = JSON.stringify(response.body);
  assert.equal(serialized.includes("password"), false);
  assert.equal(serialized.includes("Authorization"), false);
  assert.ok(["not_configured", "reachable", "unreachable", "rejected"].includes(body.asterisk.state));
}

test("ARI event URL stays on localhost and drops credentials", checkAriUrl);
test("a non-loopback ARI target fails once and does not open a socket", checkAriFailure);
test("a failed ARI socket reconnects and a later open is connected", checkAriReconnect);
test("stasis events classify start, dialed, end, and duplicates stay one session", checkStasisSessions);
test("audiosocket accepts 8 kHz audio for two sessions and rejects a bad uuid", checkAudioSocket);
test("health reports ari, audiosocket, reachability, and session count without secrets", checkHealth);
