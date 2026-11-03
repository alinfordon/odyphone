import assert from "node:assert/strict";
import test from "node:test";
import { createCallSummary } from "../src/services/summaryService.js";

test("builds a summary from caller lines without inventing a promise", () => {
  const result = createCallSummary({
    callerNumber: "+40 722 123 456",
    contactName: "Maria",
    transcript: [
      { role: "assistant", text: "Bună ziua! Sunt ODY." },
      { role: "caller", text: "Este urgent, vreau să vorbesc cu Alin și să mă sune." },
    ],
  });
  assert.match(result.summary, /Maria a spus:/);
  assert.equal(result.callerIntent, "speak_with_owner");
  assert.equal(result.directContactRequested, true);
  assert.equal(result.urgent, true);
  assert.equal(result.callbackRequested, true);
  assert.equal(result.actionRequired, true);
  assert.equal(result.summary.includes("va suna la"), false);
});

test("returns an unknown intent when no caller speech is stored", () => {
  const result = createCallSummary({ transcript: [], callerNumber: "+40722123456" });
  assert.equal(result.callerIntent, "unknown");
  assert.equal(result.actionRequired, false);
});
