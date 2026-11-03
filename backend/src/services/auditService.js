import { AuditLog } from "../models/AuditLog.js";
import { sanitizeMetadata } from "../utils/sanitize.js";

export async function writeAudit(req, action, extra = {}) {
  await AuditLog.create({
    userId: extra.userId || req.user?.id || null,
    action,
    ip: req.ip || "",
    userAgent: String(req.get?.("user-agent") || "").slice(0, 300),
    targetType: extra.targetType || "",
    targetId: extra.targetId ? String(extra.targetId) : "",
    metadata: sanitizeMetadata(extra.metadata),
  });
}
