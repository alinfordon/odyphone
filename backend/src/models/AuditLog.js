import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    action: { type: String, required: true, index: true },
    ip: { type: String, default: "" },
    userAgent: { type: String, default: "" },
    targetType: { type: String, default: "" },
    targetId: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ userId: 1, createdAt: -1 });

export const AuditLog = mongoose.model("AuditLog", auditLogSchema);
