import assert from "node:assert/strict";
import test from "node:test";
import { buildEnvView, mergeEnvText, normalizeEnvUpdate } from "../src/services/envSettingsService.js";

const sample = {
  NODE_ENV: "development",
  PORT: 4000,
  FRONTEND_URL: "http://localhost:3000",
  BACKEND_URL: "http://localhost:4000",
  MONGODB_URI: "mongodb://robo:secret-pass@192.168.0.231:27017/ody_phone_ai",
  JWT_SECRET: "jwt-secret-value-123456",
  JWT_REFRESH_SECRET: "refresh-secret-value-123456",
  TRUST_PROXY: "false",
  LOG_LEVEL: "info",
  ALLOW_REGISTRATION: "false",
  PHONE_AI_ENABLED: "false",
  PHONE_AI_DEVELOPMENT_MODE: "true",
  GEMINI_API_URL: "https://example.test",
  GEMINI_API_KEY: "gemini-secret-key",
  ASTERISK_APP_NAME: "ody-phone",
};

test("environment view shows settings and hides secrets", () => {
  const serialized = JSON.stringify(buildEnvView(sample));
  assert.equal(serialized.includes("secret-pass"), false);
  assert.equal(serialized.includes("jwt-secret-value-123456"), false);
  assert.equal(serialized.includes("refresh-secret-value-123456"), false);
  assert.equal(serialized.includes("gemini-secret-key"), false);
  assert.match(serialized, /192\.168\.0\.231:27017\/ody_phone_ai/);
  assert.match(serialized, /https:\/\/example\.test/);
  assert.match(serialized, /"value":"4000"/);
});

test("environment update accepts editable values and refuses server secrets", () => {
  const changes = normalizeEnvUpdate(sample, {
    values: {
      GEMINI_MODEL: "gemini-2.5-flash",
      PHONE_AI_DEVELOPMENT_MODE: "false",
      GEMINI_API_KEY: "",
    },
    clear: ["GEMINI_API_KEY"],
  });
  assert.deepEqual(changes, {
    GEMINI_MODEL: "gemini-2.5-flash",
    PHONE_AI_DEVELOPMENT_MODE: "false",
    GEMINI_API_KEY: "",
  });
  assert.throws(
    () => normalizeEnvUpdate(sample, { values: { JWT_SECRET: "another-secret-value" } }),
    /nu se modifică din panou/,
  );
});

test("environment file merge replaces a key without dropping the others", () => {
  const source = "PORT=4000\nGEMINI_API_KEY=old\n";
  const next = mergeEnvText(source, { GEMINI_MODEL: "gemini flash", GEMINI_API_KEY: "" });
  assert.match(next, /^PORT=4000/m);
  assert.match(next, /^GEMINI_API_KEY=$/m);
  assert.match(next, /^GEMINI_MODEL="gemini flash"$/m);
  assert.equal(next.includes("old"), false);
});
