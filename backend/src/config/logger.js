import pino from "pino";

export const logRedact = {
  paths: [
    "req.headers.authorization",
    "req.headers.cookie",
    "req.headers['x-goog-api-key']",
    "headers.authorization",
    "headers.cookie",
    "headers['x-goog-api-key']",
    "authorization",
    "password",
    "currentPassword",
    "newPassword",
    "refreshToken",
    "accessToken",
    "apiKey",
    "GEMINI_API_KEY",
    "OLLAMA_API_KEY",
    "LOCAL_STT_API_KEY",
    "LOCAL_TTS_API_KEY",
    "privateKey",
    "*.password",
    "*.refreshToken",
    "*.accessToken",
    "*.apiKey",
    "*.GEMINI_API_KEY",
    "*.OLLAMA_API_KEY",
  ],
  censor: "[redacted]",
};

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "info"),
  redact: logRedact,
});
