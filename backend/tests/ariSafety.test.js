import assert from "node:assert/strict";
import test from "node:test";
import { ariEventsUrl, buildTrunkEndpoint } from "../src/telephony/ariSafety.js";

test("trunk endpoint keeps only digits inside the owner template", () => {
  assert.equal(buildTrunkEndpoint("PJSIP/{number}@ody-trunk", "+40 722 111 000"), "PJSIP/40722111000@ody-trunk");
  assert.throws(() => buildTrunkEndpoint("PJSIP/{number};bad", "+40722111000"), /nu este utilizabil/);
  assert.throws(() => buildTrunkEndpoint("PJSIP/fixed", "+40722111000"), /nu este utilizabil/);
});

test("ARI event url does not carry the password", () => {
  const url = ariEventsUrl("http://user:secret@127.0.0.1:8088/ari", "ody-phone");
  assert.equal(url.includes("secret"), false);
  assert.equal(url.includes("user"), false);
  assert.equal(url, "ws://127.0.0.1:8088/ari/events?app=ody-phone");
});
