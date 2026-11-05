import { Router } from "express";
import { getEnv } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { ApiError } from "../../utils/errors.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { writeAudit } from "../../services/auditService.js";
import { odyCoreIdentitySchema, odyCoreProfileSchema, odyCoreTestSchema } from "../schemas.js";
import { answerWithOdyIdentity, buildOdyContext, loadOdyRecord, saveIdentity, saveProfile } from "../../odyCore/index.js";
import { runTextTest } from "../../voiceLab/textTest.js";

const router = Router();
router.use(requireAuth);

router.get("/identity", asyncHandler(async (req, res) => {
  sendData(res, buildOdyContext({ record: await loadOdyRecord(req.user.id) }).identity);
}));

router.get("/profile", asyncHandler(async (req, res) => {
  sendData(res, { items: buildOdyContext({ record: await loadOdyRecord(req.user.id) }).profile });
}));

router.get("/preview", asyncHandler(async (req, res) => {
  const context = buildOdyContext({ record: await loadOdyRecord(req.user.id), channel: "text" });
  sendData(res, { prompt: context.text, characters: context.text.length, truncated: context.truncated });
}));

router.put("/identity", validate(odyCoreIdentitySchema), asyncHandler(async (req, res) => {
  const saved = await saveIdentity(req.user.id, req.validated.body);
  await writeAudit(req, "ody-core.identity");
  sendData(res, buildOdyContext({ record: saved }).identity);
}));

router.put("/profile", validate(odyCoreProfileSchema), asyncHandler(async (req, res) => {
  const saved = await saveProfile(req.user.id, req.validated.body.items);
  await writeAudit(req, "ody-core.profile");
  sendData(res, { items: buildOdyContext({ record: saved }).profile });
}));

router.post("/test", validate(odyCoreTestSchema), asyncHandler(async (req, res) => {
  const record = await loadOdyRecord(req.user.id);
  const message = req.validated.body.message;
  const local = answerWithOdyIdentity(message, { record, language: "ro", channel: "text" });
  if (local) {
    sendData(res, { text: local, source: "identity", modelCalled: false });
    return;
  }
  sendData(res, await askModel({ message, record }));
}));

async function askModel({ message, record }) {
  const system = buildOdyContext({ record, language: "ro", channel: "text" }).text;
  const env = getEnv();
  try {
    if (env.GEMINI_API_KEY && env.GEMINI_API_URL && env.GEMINI_MODEL) {
      const generated = await runTextTest({ llm: "gemini", prompt: message, system, env });
      return { text: generated.text, source: "model", modelCalled: true, provider: "gemini" };
    }
    if (env.OLLAMA_BASE_URL && env.OLLAMA_MODEL) {
      const generated = await runTextTest({ llm: "ollama", model: env.OLLAMA_MODEL, prompt: message, system, env });
      return { text: generated.text, source: "model", modelCalled: true, provider: "ollama" };
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Modelul nu a putut răspunde. Nu a fost inventat niciun răspuns.", "ODY_CORE_MODEL");
  }
  throw new ApiError(501, "Identitatea este pregătită, dar niciun model de text nu este configurat.", "AI_NOT_CONFIGURED");
}

export const odyCoreRouter = router;
