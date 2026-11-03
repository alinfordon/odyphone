import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { listNotifications, markAllRead, markNotificationRead } from "../../services/notificationService.js";
import { idSchema, notificationListSchema } from "../schemas.js";

const router = Router();
router.use(requireAuth);

router.get("/", validate(notificationListSchema), asyncHandler(async (req, res) => {
  const result = await listNotifications(req.user.id, req.validated.query);
  sendData(res, { items: result.items, fcm: result.fcm }, 200, result.meta);
}));

router.post("/read-all", asyncHandler(async (req, res) => {
  sendData(res, await markAllRead(req.user.id));
}));

router.patch("/:id/read", validate(idSchema), asyncHandler(async (req, res) => {
  sendData(res, await markNotificationRead(req.user.id, req.validated.params.id));
}));

export const notificationsRouter = router;
