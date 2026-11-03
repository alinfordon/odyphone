import mongoose from "mongoose";
import { CONTACT_CATEGORIES, MATCH_TYPES, RULE_ACTIONS } from "../../../shared/constants/index.js";

const scheduleSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    days: { type: [Number], default: [] },
    startTime: { type: String, default: "09:00" },
    endTime: { type: String, default: "17:00" },
  },
  { _id: false },
);

const phoneRuleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    enabled: { type: Boolean, default: true },
    priority: { type: Number, required: true, min: 0, max: 1000, index: true },
    matchType: { type: String, enum: MATCH_TYPES, required: true },
    phoneNumber: { type: String, default: "" },
    normalizedPhoneNumber: { type: String, default: "" },
    category: { type: String, enum: [...CONTACT_CATEGORIES, ""], default: "" },
    schedule: { type: scheduleSchema, default: () => ({}) },
    action: { type: String, enum: RULE_ACTIONS, required: true },
    forwardTo: { type: String, default: "" },
    normalizedForwardTo: { type: String, default: "" },
    fallbackAction: { type: String, enum: [...RULE_ACTIONS, ""], default: "" },
  },
  { timestamps: true },
);

phoneRuleSchema.index({ userId: 1, enabled: 1, priority: -1 });
phoneRuleSchema.index({ userId: 1, normalizedPhoneNumber: 1 });

phoneRuleSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    description: this.description,
    enabled: this.enabled,
    priority: this.priority,
    matchType: this.matchType,
    phoneNumber: this.phoneNumber,
    normalizedPhoneNumber: this.normalizedPhoneNumber,
    category: this.category,
    schedule: this.schedule,
    action: this.action,
    forwardTo: this.forwardTo,
    normalizedForwardTo: this.normalizedForwardTo,
    fallbackAction: this.fallbackAction,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const PhoneRule = mongoose.model("PhoneRule", phoneRuleSchema);
