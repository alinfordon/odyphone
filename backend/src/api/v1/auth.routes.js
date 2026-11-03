import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendData } from "../../utils/http.js";
import { validate } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";
import { createAuthLimiter } from "../../middleware/rateLimit.js";
import {
  changePassword,
  login,
  registrationOpen,
  registerOwner,
  revokeRefresh,
  rotateRefresh,
  tokenCookies,
} from "../../services/authService.js";
import { writeAudit } from "../../services/auditService.js";
import { issueWsTicket } from "../../websocket/statusSocket.js";
import { loginSchema, passwordSchema, refreshSchema, registerSchema } from "../schemas.js";

const router = Router();
const limit = createAuthLimiter();

function sessionBody(result, client) {
  const body = { user: result.user };
  if (client === "mobile") {
    body.accessToken = result.accessToken;
    body.refreshToken = result.refreshToken;
    body.expiresInSeconds = 15 * 60;
  }
  return body;
}

function setSessionCookies(res, result) {
  const cookies = tokenCookies(result.accessToken, result.refreshToken);
  res.cookie("ody_access", result.accessToken, cookies.access);
  res.cookie("ody_refresh", result.refreshToken, cookies.refresh);
}

function clearSessionCookies(res) {
  res.clearCookie("ody_access", { path: "/" });
  res.clearCookie("ody_refresh", { path: "/" });
}

router.get("/registration", asyncHandler(async (_req, res) => {
  sendData(res, { open: await registrationOpen() });
}));

router.post("/register", limit, validate(registerSchema), asyncHandler(async (req, res) => {
  const result = await registerOwner(req.validated.body);
  await writeAudit(req, "auth.register", { userId: result.user.id });
  const client = req.validated.body.client || "web";
  if (client !== "mobile") setSessionCookies(res, result);
  sendData(res, sessionBody(result, client), 201);
}));

router.post("/login", limit, validate(loginSchema), asyncHandler(async (req, res) => {
  try {
    const result = await login(req.validated.body);
    await writeAudit(req, "auth.login", { userId: result.user.id });
    const client = req.validated.body.client || "web";
    if (client !== "mobile") setSessionCookies(res, result);
    sendData(res, sessionBody(result, client));
  } catch (error) {
    if (error.code === "INVALID_CREDENTIALS") {
      await writeAudit(req, "auth.login_failed");
    }
    throw error;
  }
}));

router.post("/refresh", limit, validate(refreshSchema), asyncHandler(async (req, res) => {
  const client = req.validated.body.client || (req.validated.body.refreshToken ? "mobile" : "web");
  const token = req.validated.body.refreshToken || req.cookies?.ody_refresh;
  const result = await rotateRefresh(token || "");
  await writeAudit(req, "auth.refresh", { userId: result.user.id });
  if (client !== "mobile") setSessionCookies(res, result);
  sendData(res, sessionBody(result, client));
}));

router.post("/logout", requireAuth, asyncHandler(async (req, res) => {
  await revokeRefresh(req.user.id, req.cookies?.ody_refresh);
  await writeAudit(req, "auth.logout");
  clearSessionCookies(res);
  sendData(res, { loggedOut: true });
}));

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  sendData(res, { user: req.user });
}));

router.post("/password", requireAuth, validate(passwordSchema), asyncHandler(async (req, res) => {
  const user = await changePassword(req.user.id, req.validated.body);
  await writeAudit(req, "auth.password_changed");
  clearSessionCookies(res);
  sendData(res, { user, reauthenticationRequired: true });
}));

router.post("/ws-ticket", requireAuth, asyncHandler(async (req, res) => {
  sendData(res, issueWsTicket(req.user.id));
}));

export const authRouter = router;
