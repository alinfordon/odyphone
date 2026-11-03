import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { getSettings, updateSettings } from "../../services/settingsService.js";
import { speechRecognitionProvider } from "../../ai/SpeechRecognitionProvider.js";
import { textToSpeechProvider } from "../../ai/TextToSpeechProvider.js";
import { audioStreamManager, callSessionManager, voiceActivityDetector } from "../../audio/AudioStreamManager.js";
import { writeAudit } from "../../services/auditService.js";
import { voiceSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.id);
  sendData(res, {
    language: settings.language,
    maxCallDurationSeconds: settings.maxCallDurationSeconds,
    responseTimeoutMs: settings.responseTimeoutMs,
    silenceMs: settings.silenceMs,
    speechRecognition: speechRecognitionProvider.describe(),
    textToSpeech: textToSpeechProvider.describe(),
    audio: audioStreamManager.describe(),
    activity: voiceActivityDetector.describe(settings),
    sessions: callSessionManager.describe(),
  });
}));

router.patch("/", validate(voiceSchema), asyncHandler(async (req, res) => {
  const settings = await updateSettings(req.user.id, req.validated.body);
  await writeAudit(req, "voice.update");
  sendData(res, {
    language: settings.language,
    maxCallDurationSeconds: settings.maxCallDurationSeconds,
    responseTimeoutMs: settings.responseTimeoutMs,
    silenceMs: settings.silenceMs,
  });
}));

export const voiceRouter = router;
