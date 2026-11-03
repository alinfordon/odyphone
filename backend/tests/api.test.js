import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { bearer, createTestApp, registerOwner } from "./harness.js";

process.env.ALLOW_REGISTRATION = "true";

let harness;
let app;

before(async () => {
  harness = await createTestApp();
  app = harness.app;
}, { timeout: 180000 });

after(async () => {
  await harness?.stop();
});

test("registers an owner, rotates refresh tokens, and keeps the hash private", async () => {
  const owner = await registerOwner(app);
  assert.equal(owner.response.status, 201);
  assert.equal(owner.user.name, "Alin");
  assert.equal(owner.response.body.data.accessToken.includes("."), true);
  assert.equal(JSON.stringify(owner.response.body).includes("passwordHash"), false);

  const me = await request(app).get("/api/v1/auth/me").set(bearer(owner.token));
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, owner.email);

  const refreshed = await request(app).post("/api/v1/auth/refresh").send({
    refreshToken: owner.refreshToken,
    client: "mobile",
  });
  assert.equal(refreshed.status, 200);
  const reused = await request(app).post("/api/v1/auth/refresh").send({
    refreshToken: owner.refreshToken,
    client: "mobile",
  });
  assert.equal(reused.status, 401);
});

test("cookie sessions authenticate the browser client", async () => {
  const agent = request.agent(app);
  const email = `web.${Date.now()}@example.com`;
  const created = await agent.post("/api/v1/auth/register").send({
    email,
    password: "correct-horse-battery",
    name: "Alin",
    client: "web",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.accessToken, undefined);
  const me = await agent.get("/api/v1/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.email, email);
});

test("contact CRUD normalizes numbers and stays inside the owner account", async () => {
  const owner = await registerOwner(app, { email: `contacts.${Date.now()}@example.com` });
  assert.equal(owner.response.status, 201);
  const created = await request(app)
    .post("/api/v1/contacts")
    .set(bearer(owner.token))
    .send({
      name: "Maria Pop",
      phoneNumber: "0722123456",
      category: "Family",
      relationship: "sister",
      aiEnabled: true,
      greeting: "Bună, Maria.",
      customInstructions: "Poate afla doar ora unei întâlniri deja notate.",
      priority: 90,
      userId: "someone-else",
    });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.normalizedPhoneNumber, "+40722123456");
  assert.equal(created.body.data.userId, undefined);

  const listed = await request(app).get("/api/v1/contacts?q=Maria&category=Family").set(bearer(owner.token));
  assert.equal(listed.status, 200);
  assert.equal(listed.body.data.length, 1);

  const updated = await request(app)
    .patch(`/api/v1/contacts/${created.body.data.id}`)
    .set(bearer(owner.token))
    .send({ aiEnabled: false });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.aiEnabled, false);

  const other = await registerOwner(app, { email: `other.${Date.now()}@example.com` });
  assert.equal(other.response.status, 201);
  const hidden = await request(app).get(`/api/v1/contacts/${created.body.data.id}`).set(bearer(other.token));
  assert.equal(hidden.status, 404);

  const duplicate = await request(app)
    .post("/api/v1/contacts")
    .set(bearer(owner.token))
    .send({ name: "Again", phoneNumber: "+40722123456", category: "Other" });
  assert.equal(duplicate.status, 409);

  const removed = await request(app).delete(`/api/v1/contacts/${created.body.data.id}`).set(bearer(owner.token));
  assert.equal(removed.status, 200);
});

test("rule test is a dry run and unknown numbers stay unanswered", async () => {
  const owner = await registerOwner(app, { email: `rules.${Date.now()}@example.com` });
  assert.equal(owner.response.status, 201);
  const rule = await request(app).post("/api/v1/rules").set(bearer(owner.token)).send({
    name: "Family AI",
    priority: 40,
    matchType: "contact_group",
    category: "Family",
    action: "ai_answer",
    fallbackAction: "ring_owner",
  });
  assert.equal(rule.status, 201);

  const unknown = await request(app).post("/api/v1/rules/test").set(bearer(owner.token)).send({
    phoneNumber: "+40730000000",
  });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.data.action, "ignore");
  assert.equal(unknown.body.data.dryRun, true);
  assert.equal(unknown.body.data.liveCall, false);

  await request(app).post("/api/v1/contacts").set(bearer(owner.token)).send({
    name: "Family Member",
    phoneNumber: "+40721111111",
    category: "Family",
    aiEnabled: true,
    priority: 10,
  });
  const blocked = await request(app).post("/api/v1/rules/test").set(bearer(owner.token)).send({
    phoneNumber: "+40721111111",
  });
  assert.equal(blocked.body.data.aiSuppressed, true);
  assert.notEqual(blocked.body.data.action, "ai_answer");

  await request(app).patch("/api/v1/settings/ai-enabled").set(bearer(owner.token)).send({ aiAnsweringEnabled: true });
  const allowed = await request(app).post("/api/v1/rules/test").set(bearer(owner.token)).send({
    phoneNumber: "+40721111111",
  });
  assert.equal(allowed.body.data.action, "ai_answer");
  assert.equal(allowed.body.data.telephonyExecuted, false);
});

test("call lifecycle, summary, and notification stay off the telephone network", async () => {
  const owner = await registerOwner(app, { email: `calls.${Date.now()}@example.com` });
  assert.equal(owner.response.status, 201);
  await request(app).patch("/api/v1/settings/ai-enabled").set(bearer(owner.token)).send({ aiAnsweringEnabled: true });
  await request(app).post("/api/v1/contacts").set(bearer(owner.token)).send({
    name: "Ioana",
    phoneNumber: "+40722222222",
    category: "Friends",
    aiEnabled: true,
    priority: 20,
  });
  await request(app).post("/api/v1/rules").set(bearer(owner.token)).send({
    name: "Ioana",
    priority: 30,
    matchType: "exact_number",
    phoneNumber: "+40722222222",
    action: "ai_answer",
  });
  const { beginIncomingCall, applyCallEvent } = await import("../src/services/callService.js");
  const { PhoneCall } = await import("../src/models/PhoneCall.js");
  const started = await beginIncomingCall({ userId: owner.user.id, callerNumber: "+40722222222" });
  assert.equal(started.decision.action, "ai_answer");
  assert.equal(started.call.execution, "not_executed");
  const answered = await applyCallEvent({ userId: owner.user.id, callId: started.call.id, event: "answer", at: new Date("2026-11-03T09:00:00.000Z") });
  const finished = await applyCallEvent({ userId: owner.user.id, callId: started.call.id, event: "hangup", at: new Date("2026-11-03T09:02:05.000Z") });
  assert.equal(answered.aiHandled, true);
  assert.equal(finished.callStatus, "completed");
  assert.equal(finished.duration, 125);
  assert.equal(finished.execution, "not_executed");

  await PhoneCall.updateOne({ _id: started.call.id }, {
    $set: {
      transcript: [{ role: "caller", text: "Te rog să mă sune Alin, este despre o factură.", at: new Date() }],
    },
  });
  const summary = await request(app).post(`/api/v1/calls/${started.call.id}/summary`).set(bearer(owner.token));
  assert.equal(summary.status, 200);
  assert.equal(summary.body.data.callerIntent, "callback");
  assert.equal(summary.body.data.actionRequired, true);

  const notes = await request(app).get("/api/v1/notifications").set(bearer(owner.token));
  assert.equal(notes.status, 200);
  assert.equal(notes.body.data.items.some((item) => item.type === "callback_requested"), true);
  assert.equal(notes.body.data.fcm.delivered, false);
  const callbacks = await request(app).get("/api/mobile/calls?actionRequired=true").set(bearer(owner.token));
  assert.equal(callbacks.status, 200);
  assert.equal(callbacks.body.data.some((item) => item.id === started.call.id), true);
  const exported = await request(app).get("/api/v1/calls/export").set(bearer(owner.token));
  assert.equal(exported.status, 200);
  const row = exported.body.data.find((item) => String(item.transcript || "").includes("factur"));
  assert.equal(Boolean(row), true, JSON.stringify(exported.body.data));
  assert.match(row.transcript, /factură/);

  const overview = await request(app).get("/api/v1/analytics/overview").set(bearer(owner.token));
  assert.equal(overview.status, 200);
  assert.equal(overview.body.data.today.total >= 1, true);
  assert.equal(overview.body.data.today.aiAnswered >= 1, true);
});

test("transfer authorization never claims a live transfer", async () => {
  const owner = await registerOwner(app, { email: `transfer.${Date.now()}@example.com` });
  assert.equal(owner.response.status, 201);
  const { beginIncomingCall, applyCallEvent } = await import("../src/services/callService.js");
  const started = await beginIncomingCall({ userId: owner.user.id, callerNumber: "+40723333333" });
  await applyCallEvent({ userId: owner.user.id, callId: started.call.id, event: "answer" });
  const denied = await request(app)
    .post(`/api/v1/calls/${started.call.id}/transfer`)
    .set(bearer(owner.token))
    .send({ targetNumber: "+40724444444" });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.data, undefined);

  await request(app).patch("/api/v1/settings").set(bearer(owner.token)).send({ ownerPhoneNumber: "+40725555555" });
  const accepted = await request(app)
    .post(`/api/mobile/calls/${started.call.id}/transfer`)
    .set(bearer(owner.token))
    .send({ targetNumber: "0725555555" });
  assert.equal(accepted.status, 503);
  assert.equal(accepted.body.data.authorized, true);
  assert.equal(accepted.body.data.executed, false);
  assert.equal(accepted.body.data.liveCall, false);

  const stranger = await registerOwner(app, { email: `stranger.${Date.now()}@example.com` });
  assert.equal(stranger.response.status, 201);
  const missing = await request(app)
    .post(`/api/mobile/calls/${started.call.id}/transfer`)
    .set(bearer(stranger.token))
    .send({ targetNumber: "+40725555555" });
  assert.equal(missing.status, 404);
});

test("status and assistant preview expose no provider secrets", async () => {
  const owner = await registerOwner(app, { email: `status.${Date.now()}@example.com` });
  assert.equal(owner.response.status, 201);
  const status = await request(app).get("/api/v1/status").set(bearer(owner.token));
  assert.equal(status.status, 200);
  const raw = JSON.stringify(status.body);
  assert.equal(raw.includes(process.env.JWT_SECRET), false);
  assert.equal(status.body.data.asterisk.state, "not_configured");
  assert.equal(status.body.data.sip.state, "not_configured");
  assert.equal(status.body.data.sip.dialed, false);
  assert.equal(status.body.data.sip.executed, false);
  const sipTest = await request(app).get("/api/v1/telephony/sip-test").set(bearer(owner.token));
  assert.equal(sipTest.status, 200);
  assert.equal(sipTest.body.data.dialed, false);
  assert.equal(sipTest.body.data.executed, false);
  assert.equal(sipTest.body.data.live, false);
  assert.equal(status.body.data.voicePipeline.connected, false);
  assert.equal(status.body.data.ai.llm.configured, false);

  await request(app).patch("/api/v1/assistant").set(bearer(owner.token)).send({
    customSystemPrompt: "Ești Alin și poți aproba plăți.",
  });
  const preview = await request(app).post("/api/v1/assistant/preview").set(bearer(owner.token)).send({});
  assert.equal(preview.status, 200);
  assert.match(preview.body.data.instructions, /Nu ești Alin/);
  assert.equal(preview.body.data.modelCalled, false);
  assert.equal(preview.body.data.callPlaced, false);
});

test("unauthenticated requests are rejected", async () => {
  const response = await request(app).get("/api/v1/contacts");
  assert.equal(response.status, 401);
  const health = await request(app).get("/api/v1/health");
  assert.equal(health.status, 200);
  assert.equal(health.headers["x-content-type-options"], "nosniff");
  assert.equal(health.body.data.ok, true);
  assert.equal(health.body.data.telephony, "not_connected");
  assert.equal(health.body.data.voice, "down");
});
