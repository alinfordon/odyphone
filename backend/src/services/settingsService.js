import { getEnv } from "../config/env.js";
import { PhoneSettings } from "../models/PhoneSettings.js";
import { ApiError } from "../utils/errors.js";
import { normalizePhoneNumber } from "../utils/phone.js";

function assertTimeZone(value) {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value }).format();
  } catch {
    throw new ApiError(400, "Fus orar necunoscut.", "VALIDATION_ERROR");
  }
}

export async function ensureSettings(userId) {
  const env = getEnv();
  let settings = await PhoneSettings.findOne({ userId });
  if (!settings) {
    settings = await PhoneSettings.create({
      userId,
      aiAnsweringEnabled: env.phoneAiEnabled,
    });
  }
  return settings;
}

export async function getSettings(userId) {
  return ensureSettings(userId);
}

export async function updateSettings(userId, input) {
  const settings = await ensureSettings(userId);
  const country = input.defaultCountry || settings.defaultCountry || "RO";
  if (input.ownerPhoneNumber !== undefined) {
    if (!input.ownerPhoneNumber) {
      settings.ownerPhoneNumber = "";
      settings.normalizedOwnerPhoneNumber = "";
    } else {
      const phone = normalizePhoneNumber(input.ownerPhoneNumber, country);
      settings.ownerPhoneNumber = phone.phoneNumber;
      settings.normalizedOwnerPhoneNumber = phone.normalizedPhoneNumber;
    }
  }
  if (input.allowedTransferNumbers !== undefined) {
    const normalized = input.allowedTransferNumbers.map(
      (number) => normalizePhoneNumber(number, country).normalizedPhoneNumber,
    );
    settings.allowedTransferNumbers = [...new Set(normalized)].slice(0, 5);
  }
  if (input.timezone) assertTimeZone(input.timezone);
  const fields = [
    "aiAnsweringEnabled",
    "answerUnknownCallers",
    "fallbackAction",
    "unknownCallerAction",
    "priorityProtectionThreshold",
    "ownerName",
    "assistantName",
    "greeting",
    "customSystemPrompt",
    "timezone",
    "defaultCountry",
    "maxCallDurationSeconds",
    "responseTimeoutMs",
    "silenceMs",
    "recordingEnabled",
    "transcriptRetentionDays",
    "recordingRetentionDays",
    "callMetadataRetentionDays",
  ];
  for (const field of fields) {
    if (input[field] !== undefined) settings[field] = input[field];
  }
  if (settings.language !== "ro") settings.language = "ro";
  await settings.save();
  return settings;
}

export function recordingWarning(settings) {
  if (!settings.recordingEnabled) {
    return "Înregistrarea este oprită. Apelurile nu sunt înregistrate.";
  }
  return "Înregistrarea este cerută în setări, dar nu există un flux de înregistrare conectat. Nu se înregistrează nimic.";
}

export async function setAiEnabled(userId, enabled) {
  if (typeof enabled !== "boolean") {
    throw new ApiError(400, "Comutatorul de răspuns AI trebuie să fie pornit sau oprit.", "VALIDATION_ERROR");
  }
  return updateSettings(userId, { aiAnsweringEnabled: enabled });
}
