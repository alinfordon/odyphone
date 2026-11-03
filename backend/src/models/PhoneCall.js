import mongoose from "mongoose";
import { CALL_STATUSES } from "../../../shared/constants/index.js";

const transcriptLineSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["caller", "assistant", "system"], required: true },
    text: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const phoneCallSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    callerNumber: { type: String, required: true },
    normalizedCallerNumber: { type: String, required: true },
    contactId: { type: mongoose.Schema.Types.ObjectId, ref: "PhoneContact", default: null, index: true },
    direction: { type: String, enum: ["inbound", "outbound"], default: "inbound" },
    callStatus: { type: String, enum: CALL_STATUSES, default: "ringing", index: true },
    startedAt: { type: Date, required: true, index: true },
    answeredAt: { type: Date, default: null },
    endedAt: { type: Date, default: null },
    duration: { type: Number, default: null },
    aiHandled: { type: Boolean, default: false },
    simulated: { type: Boolean, default: false },
    execution: {
      type: String,
      enum: ["not_executed", "telephony_pending", "channel_closed", "voice_session"],
      default: "not_executed",
    },
    ruleApplied: {
      ruleId: { type: mongoose.Schema.Types.ObjectId, default: null },
      name: { type: String, default: "" },
      action: { type: String, default: "" },
      source: { type: String, default: "" },
    },
    transcript: { type: [transcriptLineSchema], default: [] },
    summary: { type: String, default: "" },
    callerIntent: { type: String, default: "" },
    requestedAction: { type: String, default: "" },
    actionRequired: { type: Boolean, default: false },
    attentionResolved: { type: Boolean, default: false },
    read: { type: Boolean, default: false },
    recordingReference: { type: String, default: null },
    providerCallId: { type: String, default: null },
    transferRequest: {
      target: { type: String, default: "" },
      authorized: { type: Boolean, default: false },
      executed: { type: Boolean, default: false },
      detail: { type: String, default: "" },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

phoneCallSchema.index({ userId: 1, startedAt: -1 });
phoneCallSchema.index({ userId: 1, callStatus: 1, startedAt: -1 });
phoneCallSchema.index({ userId: 1, normalizedCallerNumber: 1 });
phoneCallSchema.index({ providerCallId: 1 }, { sparse: true });

phoneCallSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    callerNumber: this.callerNumber,
    normalizedCallerNumber: this.normalizedCallerNumber,
    contactId: this.contactId ? String(this.contactId) : null,
    direction: this.direction,
    callStatus: this.callStatus,
    startedAt: this.startedAt,
    answeredAt: this.answeredAt,
    endedAt: this.endedAt,
    duration: this.duration,
    aiHandled: this.aiHandled,
    simulated: this.simulated,
    execution: this.execution,
    liveCall: this.execution === "voice_session" && !this.endedAt && this.simulated !== true,
    ruleApplied: this.ruleApplied
      ? {
          ruleId: this.ruleApplied.ruleId ? String(this.ruleApplied.ruleId) : null,
          name: this.ruleApplied.name,
          action: this.ruleApplied.action,
          source: this.ruleApplied.source,
        }
      : null,
    transcript: this.transcript,
    summary: this.summary,
    callerIntent: this.callerIntent,
    requestedAction: this.requestedAction,
    actionRequired: this.actionRequired,
    attentionResolved: this.attentionResolved,
    read: this.read,
    recordingReference: this.recordingReference,
    providerCallId: this.providerCallId,
    transferRequest: this.transferRequest,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const PhoneCall = mongoose.model("PhoneCall", phoneCallSchema);
