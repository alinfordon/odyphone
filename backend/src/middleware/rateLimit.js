import rateLimit from "express-rate-limit";

function limiter({ limit, windowMs }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.AUTH_RATE_LIMIT_DISABLED === "true" && limit <= 30,
    message: {
      error: {
        message: "Prea multe cereri. Încearcă din nou mai târziu.",
        code: "RATE_LIMIT",
      },
    },
  });
}

export function createApiLimiter() {
  return limiter({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.API_RATE_LIMIT_MAX || 300),
  });
}

export function createAuthLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => process.env.AUTH_RATE_LIMIT_DISABLED === "true",
    message: {
      error: {
        message: "Prea multe încercări de autentificare. Încearcă din nou mai târziu.",
        code: "RATE_LIMIT",
      },
    },
  });
}
