import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";

process.env.AUTH_RATE_LIMIT_DISABLED = "false";
process.env.AUTH_RATE_LIMIT_MAX = "20";

let harness;
let app;

before(async () => {
  const { createTestApp } = await import("./harness.js");
  harness = await createTestApp();
  app = harness.app;
}, { timeout: 180000 });

after(async () => {
  await harness?.stop();
});

test("registration closes after the first owner", async () => {
  const first = await request(app).post("/api/v1/auth/register").send({
    email: `owner.${Date.now()}@example.com`,
    password: "correct-horse-battery",
    name: "Alin",
    client: "mobile",
  });
  assert.equal(first.status, 201);
  const second = await request(app).post("/api/v1/auth/register").send({
    email: `second.${Date.now()}@example.com`,
    password: "correct-horse-battery",
    name: "Someone",
    client: "mobile",
  });
  assert.equal(second.status, 403);
  assert.equal(second.body.error.code, "REGISTRATION_CLOSED");

  const session = await request(app)
    .post("/api/v1/telephony/sessions")
    .set("Authorization", `Bearer ${first.body.data.accessToken}`)
    .send({});
  assert.equal(session.status, 501);
  assert.equal(session.body.error.code, "TELEPHONY_NOT_CONNECTED");
});

test("a foreign origin is not reflected", async () => {
  const response = await request(app).get("/api/v1/health").set("Origin", "https://evil.example");
  assert.notEqual(response.headers["access-control-allow-origin"], "https://evil.example");
});
