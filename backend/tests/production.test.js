import assert from "node:assert/strict";
import test from "node:test";
import { describeSip, productionBlockers } from "../src/services/productionReadiness.js";

const locked = {
  NODE_ENV: "production",
  developmentMode: false,
  JWT_SECRET: "a".repeat(32),
  JWT_REFRESH_SECRET: "b".repeat(32),
  FRONTEND_URL: "https://phone.example.com",
  trustProxy: true,
  allowRegistration: false,
  AUDIOSOCKET_HOST: "127.0.0.1",
};

test("production accepts a locked-down config", () => {
  assert.deepEqual(productionBlockers(locked), []);
});

test("development is outside the production guard", () => {
  assert.deepEqual(productionBlockers({ ...locked, NODE_ENV: "development", developmentMode: true }), []);
});

test("production refuses an open config", () => {
  const codes = productionBlockers({
    ...locked,
    developmentMode: true,
    JWT_SECRET: "short-secret-value",
    JWT_REFRESH_SECRET: "short-secret-value",
    FRONTEND_URL: "http://phone.example.com",
    trustProxy: false,
    allowRegistration: true,
    AUDIOSOCKET_HOST: "0.0.0.0",
  }).map((item) => item.code);
  for (const code of [
    "DEVELOPMENT_MODE",
    "JWT_SECRET_SHORT",
    "JWT_REFRESH_SHORT",
    "JWT_SECRETS_MATCH",
    "FRONTEND_NOT_HTTPS",
    "TRUST_PROXY_OFF",
    "REGISTRATION_OPEN",
    "AUDIOSOCKET_NOT_LOOPBACK",
  ]) {
    assert.equal(codes.includes(code), true, code);
  }
});

test("sip readiness never claims a call was dialed", () => {
  const closed = describeSip({ env: { developmentMode: true }, ariConnected: false });
  assert.equal(closed.state, "not_configured");
  assert.equal(closed.dialed, false);
  assert.equal(closed.executed, false);
  assert.equal(closed.live, false);
  assert.equal(closed.allowed, false);

  const ready = describeSip({
    env: {
      developmentMode: false,
      ASTERISK_ARI_URL: "http://127.0.0.1:8088/ari",
      ASTERISK_ARI_USERNAME: "ody",
      ASTERISK_ARI_PASSWORD: "trunk-secret",
      ASTERISK_TRUNK_ENDPOINT: "PJSIP/{number}@ody-trunk",
    },
    ariConnected: true,
  });
  assert.equal(ready.state, "ready");
  assert.equal(ready.allowed, true);
  assert.equal(ready.dialed, false);
  assert.equal(ready.executed, false);
  assert.equal(ready.live, false);
  assert.equal(JSON.stringify(ready).includes("trunk-secret"), false);

  const blocked = describeSip({
    env: {
      developmentMode: true,
      ASTERISK_ARI_URL: "http://127.0.0.1:8088/ari",
      ASTERISK_ARI_USERNAME: "ody",
      ASTERISK_ARI_PASSWORD: "x",
      ASTERISK_TRUNK_ENDPOINT: "PJSIP/{number}@ody-trunk",
    },
    ariConnected: true,
  });
  assert.equal(blocked.state, "blocked");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.dialed, false);
});
