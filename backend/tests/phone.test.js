import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneNumber } from "../src/utils/phone.js";

test("normalizes Romanian numbers to E.164", () => {
  assert.equal(normalizePhoneNumber("0722123456").normalizedPhoneNumber, "+40722123456");
  assert.equal(normalizePhoneNumber("+40 722 123 456").normalizedPhoneNumber, "+40722123456");
  assert.equal(normalizePhoneNumber("0040722123456").normalizedPhoneNumber, "+40722123456");
  assert.equal(normalizePhoneNumber("0722123456").phoneNumber.includes("722"), true);
});

test("rejects a display name as a telephone number", () => {
  assert.throws(() => normalizePhoneNumber("Alin"), /E\.164 valid/);
  assert.throws(() => normalizePhoneNumber("   "), /obligatoriu/);
  assert.throws(() => normalizePhoneNumber("123"), /E\.164 valid/);
});
