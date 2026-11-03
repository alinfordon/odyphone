import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { sendData } from "../utils/http.js";
import { validate } from "../middleware/validate.js";
import { requireAuth } from "../middleware/auth.js";
import { getOverview } from "../services/analyticsService.js";
import { getCall, listCalls, updateCallFlags } from "../services/callService.js";
import { listNotifications } from "../services/notificationService.js";
import { getSettings, setAiEnabled } from "../services/settingsService.js";
import { getSystemStatus } from "../services/statusService.js";
import { requestTransfer } from "../services/transferService.js";
import { registerDevice, removeDevice } from "../services/authService.js";
import { writeAudit } from "../services/auditService.js";
import { Notification } from "../models/Notification.js";
import { CALL_STATUSES } from "../../../shared/constants/index.js";
import { aiToggleSchema, deviceSchema, idSchema, transferSchema } from "./schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/overview", asyncHandler(async (req, res) => {
  const [settings, overview, unread] = await Promise.all([
    getSettings(req.user.id),
    getOverview(req.user.id),
    Notification.countDocuments({ userId: req.user.id, read: false }),
  ]);
  const status = await getSystemStatus(settings);
  sendData(res, {
    aiAnsweringEnabled: settings.aiAnsweringEnabled,
    telephony: {
      asterisk: status.asterisk.state,
      sip: status.sip.state,
      voicePipelineConnected: status.voicePipeline.connected,
    },
    today: overview.today,
    unreadNotifications: unread,
  });
}));

router.get("/calls", asyncHandler(async (req, res) => {
  const query = { page: 1, limit: 30 };
  if (req.query.actionRequired === "true") query.actionRequired = "true";
  if (req.query.aiHandled === "true" || req.query.aiHandled === "false") query.aiHandled = req.query.aiHandled;
  if (CALL_STATUSES.includes(req.query.status)) query.status = req.query.status;
  if (typeof req.query.q === "string" && req.query.q.trim()) query.q = req.query.q.trim().slice(0, 80);
  const result = await listCalls(req.user.id, query);
  sendData(res, result.items, 200, result.meta);
}));

router.get("/calls/:id", validate(idSchema), asyncHandler(async (req, res) => {
  sendData(res, await getCall(req.user.id, req.validated.params.id));
}));

router.get("/notifications", asyncHandler(async (req, res) => {
  const result = await listNotifications(req.user.id, { page: 1, limit: 30 });
  sendData(res, result.items, 200, { ...result.meta, fcm: result.fcm });
}));

router.patch("/settings/ai-enabled", validate(aiToggleSchema), asyncHandler(async (req, res) => {
  const settings = await setAiEnabled(req.user.id, req.validated.body.aiAnsweringEnabled);
  await writeAudit(req, "mobile.ai_answering", { metadata: { aiAnsweringEnabled: settings.aiAnsweringEnabled } });
  sendData(res, { aiAnsweringEnabled: settings.aiAnsweringEnabled });
}));

router.post("/calls/:id/transfer", validate(transferSchema), asyncHandler(async (req, _res) => {
  try {
    await requestTransfer({
      userId: req.user.id,
      callId: req.validated.params.id,
      targetNumber: req.validated.body.targetNumber,
    });
  } catch (error) {
    if (error.code === "TRANSFER_DENIED" || error.code === "TELEPHONY_NOT_CONNECTED") {
      await writeAudit(req, error.code === "TRANSFER_DENIED" ? "transfer.denied" : "transfer.authorized_not_sent", {
        targetType: "call",
        targetId: req.validated.params.id,
        metadata: { authorized: error.code !== "TRANSFER_DENIED", executed: false, client: "mobile" },
      });
    }
    throw error;
  }
}));

router.post("/calls/:id/mark-read", validate(idSchema), asyncHandler(async (req, res) => {
  sendData(res, await updateCallFlags(req.user.id, req.validated.params.id, { read: true }));
}));

router.post("/devices", validate(deviceSchema), asyncHandler(async (req, res) => {
  const result = await registerDevice(req.user.id, req.validated.body.token);
  await writeAudit(req, "mobile.device_registered", { metadata: { count: result.count } });
  sendData(res, result, 201);
}));

router.delete("/devices", validate(deviceSchema), asyncHandler(async (req, res) => {
  sendData(res, await removeDevice(req.user.id, req.validated.body.token));
}));

export const mobile = router;
