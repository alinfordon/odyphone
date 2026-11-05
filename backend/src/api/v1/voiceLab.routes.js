import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { voiceLabIdSchema, voiceLabSessionSchema, voiceLabTextSchema } from "../schemas.js";
import { voiceLabStatus } from "../../voiceLab/catalog.js";
import { listOllamaModels } from "../../voiceLab/ollamaProvider.js";
import { answerWithOdyIdentity, buildOdyContext, loadOdyRecord } from "../../odyCore/index.js";
import { runTextTest } from "../../voiceLab/textTest.js";
import {
  closeLabSession,
  createLabSession,
  listLabBenchmarks,
  publicSession,
  requireLabSession,
} from "../../voiceLab/sessions.js";

const router = Router();
router.use(requireAuth);

router.get("/status", asyncHandler(async (_req, res) => {
  sendData(res, await voiceLabStatus());
}));

router.get("/ollama/models", asyncHandler(async (_req, res) => {
  const models = await listOllamaModels();
  sendData(res, {
    reachable: models.reachable,
    configured: models.configured,
    local: models.local,
    cloud: models.cloud,
    selected: models.selected,
  });
}));

router.post("/text", validate(voiceLabTextSchema), asyncHandler(async (req, res) => {
  const record = await loadOdyRecord(req.user.id);
  const local = answerWithOdyIdentity(req.validated.body.prompt, { record, language: "ro", channel: "text" });
  if (local) {
    sendData(res, { text: local, provider: "ody-core", model: "identity", cloud: false, local: true, modelCalled: false });
    return;
  }
  const identity = buildOdyContext({ record, language: "ro", channel: "text" }).text;
  const extra = req.validated.body.system;
  sendData(res, await runTextTest({ ...req.validated.body, system: [identity, extra].filter(Boolean).join("\n\n") }));
}));

router.post("/sessions", validate(voiceLabSessionSchema), asyncHandler(async (req, res) => {
  const session = createLabSession({ userId: req.user.id, config: req.validated.body });
  sendData(res, session, 201);
}));

router.get("/sessions", asyncHandler(async (req, res) => {
  const rows = listLabBenchmarks(req.user.id).map((item) => {
    const copy = { ...item };
    delete copy.userId;
    return copy;
  });
  sendData(res, rows);
}));

router.delete("/sessions/:id", validate(voiceLabIdSchema), asyncHandler(async (req, res) => {
  const session = requireLabSession(req.validated.params.id, req.user.id);
  await session.engine?.stop?.(session);
  const benchmark = closeLabSession(session.id, req.user.id);
  delete benchmark.userId;
  sendData(res, { session: publicSession({ ...session, status: "closed", connection: "closed" }), benchmark });
}));

export const voiceLabRouter = router;
