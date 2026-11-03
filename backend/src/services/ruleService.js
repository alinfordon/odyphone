import { PhoneContact } from "../models/PhoneContact.js";
import { PhoneRule } from "../models/PhoneRule.js";
import { ApiError, notFound } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { evaluateCall } from "./ruleEngine.js";
import { getSettings } from "./settingsService.js";

function publicRule(doc) {
  return doc.toPublic();
}

async function applyPhoneFields(rule, input, country) {
  if (input.matchType === "exact_number" || (input.phoneNumber && rule.matchType === "exact_number")) {
    const source = input.phoneNumber ?? rule.phoneNumber;
    if (!source) throw new ApiError(400, "O regulă pentru număr exact are nevoie de un număr de telefon.", "VALIDATION_ERROR");
    const phone = normalizePhoneNumber(source, country);
    rule.phoneNumber = phone.phoneNumber;
    rule.normalizedPhoneNumber = phone.normalizedPhoneNumber;
  } else if (input.matchType && input.matchType !== "exact_number") {
    rule.phoneNumber = "";
    rule.normalizedPhoneNumber = "";
  }
  const action = input.action || rule.action;
  if (action === "forward_to_number") {
    const source = input.forwardTo ?? rule.forwardTo;
    if (!source) throw new ApiError(400, "O regulă de redirecționare are nevoie de un număr de destinație.", "VALIDATION_ERROR");
    const phone = normalizePhoneNumber(source, country);
    rule.forwardTo = phone.phoneNumber;
    rule.normalizedForwardTo = phone.normalizedPhoneNumber;
  } else if (input.action && input.action !== "forward_to_number") {
    rule.forwardTo = "";
    rule.normalizedForwardTo = "";
  }
}

export async function listRules(userId) {
  const rules = await PhoneRule.find({ userId }).sort({ priority: -1, createdAt: 1 });
  return rules.map(publicRule);
}

export async function getRule(userId, id) {
  assertObjectId(id, "rule id");
  const rule = await PhoneRule.findOne({ _id: id, userId });
  if (!rule) throw notFound("Regula nu a fost găsită.");
  return rule;
}

export async function createRule(userId, input) {
  const settings = await getSettings(userId);
  const rule = new PhoneRule({
    userId,
    name: input.name,
    description: input.description || "",
    enabled: input.enabled ?? true,
    priority: input.priority,
    matchType: input.matchType,
    category: input.category || "",
    schedule: input.schedule || { enabled: false, days: [], startTime: "09:00", endTime: "17:00" },
    action: input.action,
    fallbackAction: input.fallbackAction || "",
  });
  await applyPhoneFields(rule, input, settings.defaultCountry);
  await rule.save();
  return publicRule(rule);
}

export async function updateRule(userId, id, input) {
  const rule = await getRule(userId, id);
  const settings = await getSettings(userId);
  const fields = ["name", "description", "enabled", "priority", "matchType", "category", "action", "fallbackAction"];
  for (const field of fields) {
    if (input[field] !== undefined) rule[field] = input[field];
  }
  if (input.schedule) rule.schedule = { ...rule.schedule.toObject?.() || rule.schedule, ...input.schedule };
  await applyPhoneFields(rule, input, settings.defaultCountry);
  if (rule.matchType === "contact_group" && !rule.category) {
    throw new ApiError(400, "O regulă pentru un grup de contacte are nevoie de o categorie.", "VALIDATION_ERROR");
  }
  await rule.save();
  return publicRule(rule);
}

export async function deleteRule(userId, id) {
  const rule = await getRule(userId, id);
  await rule.deleteOne();
  return { id: String(rule._id), deleted: true };
}

export async function testRule(userId, { phoneNumber, at }) {
  const settings = await getSettings(userId);
  const phone = normalizePhoneNumber(phoneNumber, settings.defaultCountry);
  const contact = await PhoneContact.findOne({
    userId,
    normalizedPhoneNumber: phone.normalizedPhoneNumber,
  }).sort({ enabled: -1, priority: -1 });
  const rules = await PhoneRule.find({ userId });
  const decision = evaluateCall({
    normalizedNumber: phone.normalizedPhoneNumber,
    contact,
    rules,
    settings,
    now: at ? new Date(at) : new Date(),
  });
  return {
    ...decision,
    phoneNumber: phone.phoneNumber,
    normalizedPhoneNumber: phone.normalizedPhoneNumber,
    dryRun: true,
    message: "Doar o decizie. Nu a fost plasat niciun apel telefonic.",
  };
}
