import { PhoneSettings } from "../models/PhoneSettings.js";
import { ensureSettings } from "../services/settingsService.js";
import { ApiError } from "../utils/errors.js";
import { assertNoSecret, mergeOdyRecord, profileItemsForSave } from "./profile.js";

export async function readOdyCoreRecord(userId) {
  const settings = await PhoneSettings.findOne({ userId }).select("odyCore").lean();
  return settings?.odyCore || null;
}

export async function saveOdyIdentity(userId, input) {
  const current = mergeOdyRecord(await readOdyCoreRecord(userId));
  const next = {
    personalityNotes: bounded(input.personalityNotes, 1000),
    instructions: bounded(input.instructions, 2000),
    profile: current.profile.map(storedFact),
  };
  await persist(userId, next);
  return mergeOdyRecord(next);
}

export async function saveOdyProfile(userId, items) {
  const current = mergeOdyRecord(await readOdyCoreRecord(userId));
  const profile = profileItemsForSave(items);
  const next = {
    personalityNotes: current.personalityNotes,
    instructions: current.instructions,
    profile,
  };
  await persist(userId, next);
  return mergeOdyRecord(next);
}

async function persist(userId, odyCore) {
  const settings = await ensureSettings(userId);
  settings.odyCore = odyCore;
  settings.markModified("odyCore");
  await settings.save();
}

function bounded(value, max) {
  const text = assertNoSecret(value ?? "");
  if (text.length > max) {
    throw new ApiError(400, `Textul poate avea cel mult ${max} de caractere.`, "VALIDATION_ERROR");
  }
  return text;
}

function storedFact(item) {
  return { id: item.id, enabled: item.enabled, value: item.value };
}
