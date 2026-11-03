import { Router } from "express";
import { composeAssistantInstructions } from "../../../../shared/constants/index.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { getContact } from "../../services/contactService.js";
import { getSettings, updateSettings } from "../../services/settingsService.js";
import { geminiProvider } from "../../ai/GeminiProvider.js";
import { writeAudit } from "../../services/auditService.js";
import { assistantSchema, previewSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.id);
  sendData(res, {
    assistantName: settings.assistantName,
    ownerName: settings.ownerName,
    greeting: settings.greeting,
    customSystemPrompt: settings.customSystemPrompt,
    language: settings.language,
    basePolicy: composeAssistantInstructions({ settings }).split("\n\n")[0],
    provider: {
      name: "gemini",
      configured: geminiProvider.isConfigured(),
      live: false,
    },
    note: "Aceste instrucțiuni sunt păstrate pentru motorul vocal. Acest ecran nu plasează un apel și nu contactează modelul.",
  });
}));

router.patch("/", validate(assistantSchema), asyncHandler(async (req, res) => {
  const settings = await updateSettings(req.user.id, req.validated.body);
  await writeAudit(req, "assistant.update");
  sendData(res, {
    assistantName: settings.assistantName,
    ownerName: settings.ownerName,
    greeting: settings.greeting,
    customSystemPrompt: settings.customSystemPrompt,
  });
}));

router.post("/preview", validate(previewSchema), asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.id);
  let contact = null;
  if (req.validated.body.contactId) {
    contact = await getContact(req.user.id, req.validated.body.contactId);
  }
  sendData(res, {
    instructions: composeAssistantInstructions({ settings, contact }),
    modelCalled: false,
    callPlaced: false,
  });
}));

export const assistantRouter = router;
