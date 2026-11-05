export { ODY_IDENTITY, ODY_INTRODUCTION, ODY_HELP, ODY_SECRET_REFUSAL, ODY_UNKNOWN } from "./identity.js";
export { ODY_PERSONALITY } from "./personality.js";
export { ODY_PROFILE, mergeOdyRecord } from "./profile.js";
export { answerWithOdyIdentity, buildOdyContext } from "./contextBuilder.js";

async function store() {
  return import("./store.js");
}

export async function loadOdyRecord(userId) {
  try {
    const mongoose = (await import("mongoose")).default;
    if (mongoose.connection.readyState !== 1) return null;
    return (await store()).readOdyCoreRecord(userId);
  } catch {
    return null;
  }
}

export async function saveIdentity(userId, input) {
  return (await store()).saveOdyIdentity(userId, input);
}

export async function saveProfile(userId, items) {
  return (await store()).saveOdyProfile(userId, items);
}
