import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCall } from "../src/services/ruleEngine.js";

const settings = {
  aiAnsweringEnabled: true,
  answerUnknownCallers: false,
  fallbackAction: "ring_owner",
  unknownCallerAction: "ignore",
  priorityProtectionThreshold: 80,
  timezone: "Europe/Bucharest",
  normalizedOwnerPhoneNumber: "",
};

const mondayMorning = new Date("2026-11-02T08:30:00.000Z");

test("unknown callers are not answered by AI by default", () => {
  const decision = evaluateCall({
    normalizedNumber: "+40722123456",
    contact: null,
    rules: [],
    settings,
    now: mondayMorning,
  });
  assert.equal(decision.action, "ignore");
  assert.equal(decision.aiAuthorized, false);
  assert.equal(decision.liveCall, false);
  assert.equal(decision.telephonyExecuted, false);
});

test("an unknown-caller AI rule stays blocked until the owner enables that policy", () => {
  const decision = evaluateCall({
    normalizedNumber: "+40722123456",
    contact: null,
    rules: [{ _id: "rule-unknown", name: "Strangers", enabled: true, priority: 100, matchType: "unknown", action: "ai_answer" }],
    settings,
    now: mondayMorning,
  });
  assert.equal(decision.action, "ignore");
  assert.equal(decision.aiSuppressed, true);
  assert.equal(decision.matchedRuleName, "Strangers");
});

test("higher priority wins and a disabled contact is not treated as authorized", () => {
  const contact = { _id: "contact-1", name: "Maria", enabled: true, aiEnabled: true, category: "Family", priority: 10 };
  const decision = evaluateCall({
    normalizedNumber: "+40722123456",
    contact,
    rules: [
      { _id: "low", name: "Low", enabled: true, priority: 10, matchType: "exact_number", normalizedPhoneNumber: "+40722123456", action: "voicemail", createdAt: "2026-01-01T00:00:00.000Z" },
      { _id: "high", name: "High", enabled: true, priority: 50, matchType: "exact_number", normalizedPhoneNumber: "+40722123456", action: "ai_answer", createdAt: "2026-01-02T00:00:00.000Z" },
    ],
    settings,
    now: mondayMorning,
  });
  assert.equal(decision.action, "ai_answer");
  assert.equal(decision.matchedRuleName, "High");

  const disabled = evaluateCall({
    normalizedNumber: "+40722123456",
    contact: { ...contact, enabled: false },
    rules: [
      { _id: "group", name: "Family", enabled: true, priority: 20, matchType: "contact_group", category: "Family", action: "ai_answer" },
    ],
    settings,
    now: mondayMorning,
  });
  assert.equal(disabled.action, "ignore");
  assert.equal(disabled.knownContact, false);
});

test("AI answering off replaces an authorized AI rule with the fallback", () => {
  const decision = evaluateCall({
    normalizedNumber: "+40722123456",
    contact: { _id: "c", name: "Maria", enabled: true, aiEnabled: true, category: "Friends", priority: 1 },
    rules: [{ _id: "r", name: "Maria AI", enabled: true, priority: 5, matchType: "exact_number", normalizedPhoneNumber: "+40722123456", action: "ai_answer", fallbackAction: "ring_owner" }],
    settings: { ...settings, aiAnsweringEnabled: false },
    now: mondayMorning,
  });
  assert.equal(decision.action, "ring_owner");
  assert.equal(decision.aiSuppressed, true);
});

test("a contact with AI disabled cannot be answered by a matching AI rule", () => {
  const decision = evaluateCall({
    normalizedNumber: "+40722123456",
    contact: { _id: "c", name: "Maria", enabled: true, aiEnabled: false, category: "Friends", priority: 1 },
    rules: [{ _id: "r", name: "Maria AI", enabled: true, priority: 5, matchType: "exact_number", normalizedPhoneNumber: "+40722123456", action: "ai_answer" }],
    settings,
    now: mondayMorning,
  });
  assert.equal(decision.action, "ring_owner");
  assert.equal(decision.aiSuppressed, true);
});

test("a general block does not apply to a priority contact, while an exact block does", () => {
  const contact = { _id: "c", name: "Mama", enabled: true, aiEnabled: false, category: "Family", priority: 95 };
  const general = evaluateCall({
    normalizedNumber: "+40722123456",
    contact,
    rules: [{ _id: "g", name: "Block family", enabled: true, priority: 100, matchType: "contact_group", category: "Family", action: "reject" }],
    settings,
    now: mondayMorning,
  });
  assert.equal(general.action, "ring_owner");
  assert.equal(general.protectedContact, true);

  const exact = evaluateCall({
    normalizedNumber: "+40722123456",
    contact,
    rules: [{ _id: "e", name: "Exact reject", enabled: true, priority: 10, matchType: "exact_number", normalizedPhoneNumber: "+40722123456", action: "reject" }],
    settings,
    now: mondayMorning,
  });
  assert.equal(exact.action, "reject");
});

test("a contact without a matching rule uses the fallback", () => {
  const decision = evaluateCall({
    normalizedNumber: "+40722123456",
    contact: { _id: "c", name: "Ion", enabled: true, aiEnabled: true, category: "Business", priority: 0 },
    rules: [],
    settings,
    now: mondayMorning,
  });
  assert.equal(decision.action, "ring_owner");
  assert.equal(decision.source, "fallback");
  assert.equal(decision.aiAuthorized, false);
});

test("schedule windows skip rules outside their hours", () => {
  const rule = {
    _id: "hours",
    name: "Work",
    enabled: true,
    priority: 20,
    matchType: "exact_number",
    normalizedPhoneNumber: "+40722123456",
    action: "ai_answer",
    schedule: { enabled: true, days: [1], startTime: "09:00", endTime: "17:00" },
  };
  const contact = { _id: "c", name: "Ion", enabled: true, aiEnabled: true, category: "Business", priority: 0 };
  const closed = evaluateCall({
    normalizedNumber: "+40722123456",
    contact,
    rules: [rule],
    settings,
    now: new Date("2026-11-02T06:30:00.000Z"),
  });
  assert.equal(closed.matchedRuleName, null);
  assert.equal(closed.skipped[0].reason, "outside_schedule");

  const open = evaluateCall({
    normalizedNumber: "+40722123456",
    contact,
    rules: [rule],
    settings,
    now: new Date("2026-11-02T08:30:00.000Z"),
  });
  assert.equal(open.action, "ai_answer");
});
