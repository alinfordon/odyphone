import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { requireAuth } from "../../middleware/auth.js";
import { getAnalytics, getOverview } from "../../services/analyticsService.js";

const router = Router();
router.use(requireAuth);

router.get("/", asyncHandler(async (req, res) => {
  sendData(res, await getAnalytics(req.user.id));
}));

router.get("/overview", asyncHandler(async (req, res) => {
  sendData(res, await getOverview(req.user.id));
}));

export const analyticsRouter = router;
