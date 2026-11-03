import mongoose from "mongoose";
import { RULE_ACTIONS } from "../../../shared/constants/index.js";
import {
  DEFAULT_ASSISTANT_NAME,
  DEFAULT_COUNTRY,
  DEFAULT_GREETING,
  DEFAULT_OWNER_NAME,
  DEFAULT_TIME_ZONE,
} from "../../../shared/constants/index.js";

const phoneSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
    aiAnsweringEnabled: { type: Boolean, default: false },
    answerUnknownCallers: { type: Boolean, default: false },
    fallbackAction: { type: String, enum: RULE_ACTIONS, default: "ring_owner" },
    unknownCallerAction: { type: String, enum: RULE_ACTIONS, default: "ignore" },
    priorityProtectionThreshold: { type: Number, default: 80, min: 0, max: 100 },
    ownerName: { type: String, default: DEFAULT_OWNER_NAME },
    assistantName: { type: String, default: DEFAULT_ASSISTANT_NAME },
    greeting: { type: String, default: DEFAULT_GREETING },
    customSystemPrompt: { type: String, default: "" },
    language: { type: String, default: "ro" },
    timezone: { type: String, default: DEFAULT_TIME_ZONE },
    defaultCountry: { type: String, default: DEFAULT_COUNTRY },
    ownerPhoneNumber: { type: String, default: "" },
    normalizedOwnerPhoneNumber: { type: String, default: "" },
    allowedTransferNumbers: { type: [String], default: [] },
    maxCallDurationSeconds: { type: Number, default: 900, min: 30, max: 7200 },
    responseTimeoutMs: { type: Number, default: 8000, min: 1000, max: 60000 },
    silenceMs: { type: Number, default: 700, min: 200, max: 5000 },
    recordingEnabled: { type: Boolean, default: false },
    transcriptRetentionDays: { type: Number, default: 30, min: 1, max: 3650 },
    recordingRetentionDays: { type: Number, default: 7, min: 1, max: 3650 },
    callMetadataRetentionDays: { type: Number, default: 365, min: 1, max: 3650 },
  },
  { timestamps: true },
);

phoneSettingsSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    aiAnsweringEnabled: this.aiAnsweringEnabled,
    answerUnknownCallers: this.answerUnknownCallers,
    fallbackAction: this.fallbackAction,
    unknownCallerAction: this.unknownCallerAction,
    priorityProtectionThreshold: this.priorityProtectionThreshold,
    ownerName: this.ownerName,
    assistantName: this.assistantName,
    greeting: this.greeting,
    customSystemPrompt: this.customSystemPrompt,
    language: this.language,
    timezone: this.timezone,
    defaultCountry: this.defaultCountry,
    ownerPhoneNumber: this.ownerPhoneNumber,
    normalizedOwnerPhoneNumber: this.normalizedOwnerPhoneNumber,
    allowedTransferNumbers: this.allowedTransferNumbers,
    maxCallDurationSeconds: this.maxCallDurationSeconds,
    responseTimeoutMs: this.responseTimeoutMs,
    silenceMs: this.silenceMs,
    recordingEnabled: this.recordingEnabled,
    recordingActive: false,
    transcriptRetentionDays: this.transcriptRetentionDays,
    recordingRetentionDays: this.recordingRetentionDays,
    callMetadataRetentionDays: this.callMetadataRetentionDays,
    updatedAt: this.updatedAt,
  };
};

export const PhoneSettings = mongoose.model("PhoneSettings", phoneSettingsSchema);
