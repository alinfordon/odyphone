import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "info"),
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "headers.authorization",
      "headers.cookie",
      "authorization",
      "password",
      "currentPassword",
      "newPassword",
      "refreshToken",
      "accessToken",
      "apiKey",
      "privateKey",
      "*.password",
      "*.refreshToken",
      "*.accessToken",
      "*.apiKey",
    ],
    censor: "[redacted]",
  },
});
