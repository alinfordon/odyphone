import mongoose from "mongoose";
import { CONTACT_CATEGORIES } from "../../../shared/constants/index.js";

const phoneContactSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true },
    normalizedPhoneNumber: { type: String, required: true },
    category: { type: String, enum: CONTACT_CATEGORIES, default: "Other" },
    description: { type: String, default: "" },
    relationship: { type: String, default: "" },
    aiEnabled: { type: Boolean, default: false },
    greeting: { type: String, default: "" },
    customInstructions: { type: String, default: "" },
    priority: { type: Number, default: 0, min: 0, max: 100 },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

phoneContactSchema.index({ userId: 1, normalizedPhoneNumber: 1 }, { unique: true });
phoneContactSchema.index({ userId: 1, category: 1 });
phoneContactSchema.index({ userId: 1, name: 1 });

phoneContactSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    name: this.name,
    phoneNumber: this.phoneNumber,
    normalizedPhoneNumber: this.normalizedPhoneNumber,
    category: this.category,
    description: this.description,
    relationship: this.relationship,
    aiEnabled: this.aiEnabled,
    greeting: this.greeting,
    customInstructions: this.customInstructions,
    priority: this.priority,
    enabled: this.enabled,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const PhoneContact = mongoose.model("PhoneContact", phoneContactSchema);
