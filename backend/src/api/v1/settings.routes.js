import { Router } from "express";
import { buildBasePolicy } from "../../../../shared/constants/index.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { getSettings, recordingWarning, setAiEnabled, updateSettings } from "../../services/settingsService.js";
import { describeEnvironment, updateEnvironment } from "../../services/envSettingsService.js";
import { applyRetention } from "../../services/privacyService.js";
import { writeAudit } from "../../services/auditService.js";
import { aiToggleSchema, settingsSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/environment", asyncHandler(async (_req, res) => {
  sendData(res, { groups: describeEnvironment() });
}));

router.patch("/environment", asyncHandler(async (req, res) => {
  const result = await updateEnvironment(req.body || {});
  await writeAudit(req, "settings.environment", { metadata: { fields: result.changed.join(",") } });
  sendData(res, result);
}));

router.get("/", asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.id);
  sendData(res, {
    ...settings.toPublic(),
    recordingMessage: recordingWarning(settings),
    basePolicy: buildBasePolicy(settings),
  });
}));

router.patch("/", validate(settingsSchema), asyncHandler(async (req, res) => {
  const settings = await updateSettings(req.user.id, req.validated.body);
  await writeAudit(req, "settings.update", { metadata: { fields: Object.keys(req.validated.body) } });
  sendData(res, { ...settings.toPublic(), recordingMessage: recordingWarning(settings) });
}));

router.patch("/ai-enabled", validate(aiToggleSchema), asyncHandler(async (req, res) => {
  const settings = await setAiEnabled(req.user.id, req.validated.body.aiAnsweringEnabled);
  await writeAudit(req, "settings.ai_answering", { metadata: { aiAnsweringEnabled: settings.aiAnsweringEnabled } });
  sendData(res, settings.toPublic());
}));

router.post("/privacy/purge", asyncHandler(async (req, res) => {
  const result = await applyRetention(req.user.id);
  await writeAudit(req, "privacy.purge", { metadata: result });
  sendData(res, result);
}));

export const settingsRouter = router;
