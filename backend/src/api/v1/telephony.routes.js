import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { ApiError } from "../../utils/errors.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { getSettings } from "../../services/settingsService.js";
import { getSystemStatus } from "../../services/statusService.js";
import { asteriskProvider } from "../../telephony/AsteriskProvider.js";
import { simulateCallLifecycle } from "../../services/callSimulator.js";
import { describeSip } from "../../services/productionReadiness.js";
import { getEnv } from "../../config/env.js";
import { ariRuntime } from "../../telephony/ariEvents.js";
import { simulateSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/status", asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.id);
  const status = await getSystemStatus(settings);
  sendData(res, { ...status, provider: "asterisk", configured: asteriskProvider.configured() });
}));

router.get("/sip-test", asyncHandler(async (_req, res) => {
  sendData(res, describeSip({ env: getEnv(), ariConnected: ariRuntime.connected }));
}));

router.post("/simulate", validate(simulateSchema), asyncHandler(async (req, res) => {
  const result = await simulateCallLifecycle({
    userId: req.user.id,
    phoneNumber: req.validated.body.phoneNumber,
  });
  sendData(res, result, 201);
}));

router.post("/sessions", asyncHandler(async () => {
  throw new ApiError(
    501,
    "Nu se poate deschide o sesiune din acest endpoint. Conversația vocală pornește din evenimentul Asterisk, când AudioSocket și furnizorii sunt gata.",
    "TELEPHONY_NOT_CONNECTED",
  );
}));

export const telephonyRouter = router;
