import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { User } from "../models/User.js";
import { ApiError } from "../utils/errors.js";

export async function requireAuth(req, _res, next) {
  try {
    const header = req.get("authorization") || "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const token = bearer || req.cookies?.ody_access;
    if (!token) {
      throw new ApiError(401, "Autentificarea este necesară.", "UNAUTHENTICATED");
    }
    const env = getEnv();
    let payload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET);
    } catch {
      throw new ApiError(401, "Tokenul de acces este invalid sau expirat.", "UNAUTHENTICATED");
    }
    if (payload.type !== "access" || !payload.sub) {
      throw new ApiError(401, "Tokenul de acces este invalid sau expirat.", "UNAUTHENTICATED");
    }
    const user = await User.findById(payload.sub);
    if (!user) {
      throw new ApiError(401, "Contul acestui token nu mai există.", "UNAUTHENTICATED");
    }
    req.user = user.toPublic();
    next();
  } catch (error) {
    next(error);
  }
}
