import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { getSettings } from "../../services/settingsService.js";
import { getSystemStatus } from "../../services/statusService.js";
import {
  ACTION_LABELS,
  CONTACT_CATEGORIES,
  MATCH_TYPES,
  NOTIFICATION_TYPES,
  RULE_ACTIONS,
} from "../../../../shared/constants/index.js";
import { authRouter } from "./auth.routes.js";
import { contactsRouter } from "./contacts.routes.js";
import { rulesRouter } from "./rules.routes.js";
import { callsRouter } from "./calls.routes.js";
import { assistantRouter } from "./assistant.routes.js";
import { voiceRouter } from "./voice.routes.js";
import { notificationsRouter } from "./notifications.routes.js";
import { settingsRouter } from "./settings.routes.js";
import { telephonyRouter } from "./telephony.routes.js";
import { analyticsRouter } from "./analytics.routes.js";

const router = Router();

router.get("/meta", requireAuth, asyncHandler(async (_req, res) => {
  sendData(res, {
    categories: CONTACT_CATEGORIES,
    actions: RULE_ACTIONS,
    actionLabels: ACTION_LABELS,
    matchTypes: MATCH_TYPES,
    notificationTypes: NOTIFICATION_TYPES,
  });
}));

router.get("/status", requireAuth, asyncHandler(async (req, res) => {
  const settings = await getSettings(req.user.id);
  sendData(res, await getSystemStatus(settings));
}));

router.use("/auth", authRouter);
router.use("/contacts", contactsRouter);
router.use("/rules", rulesRouter);
router.use("/calls", callsRouter);
router.use("/assistant", assistantRouter);
router.use("/voice", voiceRouter);
router.use("/notifications", notificationsRouter);
router.use("/settings", settingsRouter);
router.use("/telephony", telephonyRouter);
router.use("/analytics", analyticsRouter);

export const v1 = router;
