import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import test from "node:test";

test("push reaches a registered device and drops an unregistered token", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" });
  const previous = {
    FCM_PROJECT_ID: process.env.FCM_PROJECT_ID,
    FCM_CLIENT_EMAIL: process.env.FCM_CLIENT_EMAIL,
    FCM_PRIVATE_KEY: process.env.FCM_PRIVATE_KEY,
  };
  process.env.FCM_PROJECT_ID = "ody-test";
  process.env.FCM_CLIENT_EMAIL = "push@example.test";
  process.env.FCM_PRIVATE_KEY = pem;
  const { resetEnvCache } = await import("../src/config/env.js");
  const { deliverPush, resetFcmCache } = await import("../src/notifications/fcm.js");
  resetEnvCache();
  resetFcmCache();
  const removed = [];
  try {
    const none = await deliverPush({
      userId: "owner",
      title: "Apel",
      body: "text",
      loadTokens: async () => [],
      fetchImpl: async () => {
        throw new Error("nu trebuia trimis");
      },
    });
    assert.equal(none.state, "no_device");
    const sent = await deliverPush({
      userId: "owner",
      title: "Revenire cerută",
      body: "Apelantul a cerut să fie sunat.",
      data: { type: "callback_requested", callId: "call-1" },
      loadTokens: async () => ["device-token", "stale-token"],
      removeToken: async (_userId, token) => {
        removed.push(token);
      },
      fetchImpl: async (url, init) => {
        assert.equal(String(init.body || "").includes("BEGIN PRIVATE KEY"), false);
        if (String(url).includes("oauth2.googleapis.com")) {
          return new Response(JSON.stringify({ access_token: "access-test", expires_in: 3600 }), { status: 200 });
        }
        const payload = JSON.parse(init.body);
        assert.equal(payload.message.notification.title, "Revenire cerută");
        assert.equal(init.headers.Authorization, "Bearer access-test");
        if (payload.message.token === "stale-token") {
          return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
        }
        return new Response(JSON.stringify({ name: "projects/ody-test/messages/1" }), { status: 200 });
      },
    });
    assert.equal(sent.state, "sent");
    assert.match(sent.detail, /Trimis către 1/);
    assert.deepEqual(removed, ["stale-token"]);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
    resetFcmCache();
  }
});
