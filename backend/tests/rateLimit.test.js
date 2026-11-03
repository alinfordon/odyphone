import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";

process.env.AUTH_RATE_LIMIT_DISABLED = "false";
process.env.AUTH_RATE_LIMIT_MAX = "3";

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

test("login attempts are rate limited", async () => {
  const body = { email: "rate@example.com", password: "not-the-password", client: "mobile" };
  const statuses = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await request(app).post("/api/v1/auth/login").send(body);
    statuses.push(response.status);
  }
  assert.deepEqual(statuses.slice(0, 3), [401, 401, 401]);
  assert.equal(statuses[3], 429);
});
