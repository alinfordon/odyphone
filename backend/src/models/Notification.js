import mongoose from "mongoose";
import { NOTIFICATION_TYPES } from "../../../shared/constants/index.js";

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    callId: { type: mongoose.Schema.Types.ObjectId, ref: "PhoneCall", default: null },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    delivery: {
      internal: { type: String, default: "stored" },
      fcm: { type: String, default: "not_configured" },
      fcmDetail: { type: String, default: "" },
    },
  },
  { timestamps: true },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

notificationSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    type: this.type,
    title: this.title,
    body: this.body,
    callId: this.callId ? String(this.callId) : null,
    read: this.read,
    readAt: this.readAt,
    delivery: this.delivery,
    createdAt: this.createdAt,
  };
};

export const Notification = mongoose.model("Notification", notificationSchema);
