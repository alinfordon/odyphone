import { PhoneCall } from "../models/PhoneCall.js";
import { getSettings } from "./settingsService.js";

export async function applyRetention(userId) {
  const settings = await getSettings(userId);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const transcriptBefore = new Date(now - settings.transcriptRetentionDays * day);
  const recordingBefore = new Date(now - settings.recordingRetentionDays * day);
  const metadataBefore = new Date(now - settings.callMetadataRetentionDays * day);

  const transcripts = await PhoneCall.updateMany(
    { userId, startedAt: { $lt: transcriptBefore } },
    { $set: { transcript: [] } },
  );
  const recordings = await PhoneCall.updateMany(
    { userId, startedAt: { $lt: recordingBefore }, recordingReference: { $ne: null } },
    { $set: { recordingReference: null } },
  );
  const deleted = await PhoneCall.deleteMany({ userId, startedAt: { $lt: metadataBefore } });

  return {
    transcriptsCleared: transcripts.modifiedCount,
    recordingReferencesCleared: recordings.modifiedCount,
    callsDeleted: deleted.deletedCount,
    mediaStore: "Acest serviciu nu stochează fișiere de înregistrare.",
  };
}
