import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/errors.js";
import { ensureSettings } from "./settingsService.js";

const ACCESS_MS = 15 * 60 * 1000;
const REFRESH_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function signAccess(userId) {
  const env = getEnv();
  return jwt.sign({ sub: String(userId), type: "access" }, env.JWT_SECRET, { expiresIn: "15m" });
}

function signRefresh(userId, jti) {
  const env = getEnv();
  return jwt.sign({ sub: String(userId), type: "refresh", jti }, env.JWT_REFRESH_SECRET, { expiresIn: "7d" });
}

async function storeRefresh(user, token) {
  user.refreshTokens = user.refreshTokens.filter((entry) => entry.expiresAt > new Date());
  user.refreshTokens.push({
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + REFRESH_MS),
  });
  if (user.refreshTokens.length > 10) {
    user.refreshTokens = user.refreshTokens.slice(-10);
  }
  await user.save();
}

export function tokenCookies(accessToken, refreshToken) {
  const env = getEnv();
  const base = {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  };
  return {
    access: { ...base, maxAge: ACCESS_MS },
    refresh: { ...base, maxAge: REFRESH_MS },
    accessToken,
    refreshToken,
  };
}

export async function registrationOpen() {
  const env = getEnv();
  if (env.allowRegistration) return true;
  const count = await User.countDocuments();
  return count === 0;
}

export async function registerOwner({ email, password, name }) {
  if (!(await registrationOpen())) {
    throw new ApiError(403, "Înregistrarea este închisă. Există deja un cont de proprietar.", "REGISTRATION_CLOSED");
  }
  const rounds = getEnv().NODE_ENV === "test" ? 4 : 12;
  const passwordHash = await bcrypt.hash(password, rounds);
  const user = await User.create({ email, name, passwordHash });
  await ensureSettings(user._id);
  const tokens = await issueTokens(user);
  return { user: user.toPublic(), ...tokens };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email });
  const rounds = getEnv().NODE_ENV === "test" ? 4 : 12;
  const hash = user?.passwordHash || (await bcrypt.hash("placeholder-password", rounds));
  const matches = await bcrypt.compare(password, hash);
  if (!user || !matches) {
    throw new ApiError(401, "Email sau parolă incorectă.", "INVALID_CREDENTIALS");
  }
  const tokens = await issueTokens(user);
  return { user: user.toPublic(), ...tokens };
}

async function issueTokens(user) {
  const accessToken = signAccess(user._id);
  const refreshToken = signRefresh(user._id, randomBytes(16).toString("hex"));
  await storeRefresh(user, refreshToken);
  return { accessToken, refreshToken };
}

export async function rotateRefresh(refreshToken) {
  const env = getEnv();
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw new ApiError(401, "Tokenul de reîmprospătare este invalid sau expirat.", "UNAUTHENTICATED");
  }
  if (payload.type !== "refresh" || !payload.sub) {
    throw new ApiError(401, "Tokenul de reîmprospătare este invalid sau expirat.", "UNAUTHENTICATED");
  }
  const user = await User.findById(payload.sub);
  if (!user) {
    throw new ApiError(401, "Tokenul de reîmprospătare este invalid sau expirat.", "UNAUTHENTICATED");
  }
  const tokenHash = hashToken(refreshToken);
  const existing = user.refreshTokens.find((entry) => entry.tokenHash === tokenHash && entry.expiresAt > new Date());
  if (!existing) {
    throw new ApiError(401, "Tokenul de reîmprospătare este invalid sau expirat.", "UNAUTHENTICATED");
  }
  user.refreshTokens = user.refreshTokens.filter((entry) => entry.tokenHash !== tokenHash);
  await user.save();
  const tokens = await issueTokens(user);
  return { user: user.toPublic(), ...tokens };
}

export async function revokeRefresh(userId, refreshToken) {
  const user = await User.findById(userId);
  if (!user) return;
  if (!refreshToken) {
    user.refreshTokens = [];
  } else {
    const tokenHash = hashToken(refreshToken);
    user.refreshTokens = user.refreshTokens.filter((entry) => entry.tokenHash !== tokenHash);
  }
  await user.save();
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, "Autentificarea este necesară.", "UNAUTHENTICATED");
  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) {
    throw new ApiError(401, "Parola curentă este incorectă.", "INVALID_CREDENTIALS");
  }
  const rounds = getEnv().NODE_ENV === "test" ? 4 : 12;
  user.passwordHash = await bcrypt.hash(newPassword, rounds);
  user.refreshTokens = [];
  await user.save();
  return user.toPublic();
}

export async function registerDevice(userId, token) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, "Autentificarea este necesară.", "UNAUTHENTICATED");
  user.fcmTokens = user.fcmTokens.filter((entry) => entry.token !== token);
  user.fcmTokens.push({ token, createdAt: new Date() });
  if (user.fcmTokens.length > 10) user.fcmTokens = user.fcmTokens.slice(-10);
  await user.save();
  return { registered: true, count: user.fcmTokens.length };
}

export async function removeDevice(userId, token) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(401, "Autentificarea este necesară.", "UNAUTHENTICATED");
  user.fcmTokens = user.fcmTokens.filter((entry) => entry.token !== token);
  await user.save();
  return { removed: true, count: user.fcmTokens.length };
}
