import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const configDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(configDir, "../../..");

export function envFilePath() {
  return path.join(repoRoot, ".env");
}

let filesLoaded = false;
let cache;

function loadEnvFiles() {
  if (filesLoaded) return;
  filesLoaded = true;
  const rootEnv = path.join(repoRoot, ".env");
  if (existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv });
  }
}

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  FRONTEND_URL: z.string().trim().min(1).default("http://localhost:3000"),
  BACKEND_URL: z.string().trim().min(1).default("http://localhost:4000"),
  MONGODB_URI: z.string().trim().min(1),
  JWT_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  LOG_LEVEL: z.string().trim().default("info"),
  ALLOW_REGISTRATION: z.enum(["true", "false"]).default("false"),
  ASTERISK_ARI_URL: optionalText,
  ASTERISK_ARI_USERNAME: optionalText,
  ASTERISK_ARI_PASSWORD: optionalText,
  ASTERISK_APP_NAME: z.string().trim().default("ody-phone"),
  ASTERISK_TRUNK_ENDPOINT: optionalText,
  GEMINI_API_URL: optionalText,
  GEMINI_API_KEY: optionalText,
  GEMINI_MODEL: optionalText,
  GEMINI_LIVE_MODEL: z.string().trim().default("gemini-3.8-live"),
  OLLAMA_BASE_URL: optionalText,
  OLLAMA_MODEL: optionalText,
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  LOCAL_STT_URL: optionalText,
  LOCAL_STT_API_KEY: optionalText,
  LOCAL_TTS_URL: optionalText,
  LOCAL_TTS_API_KEY: optionalText,
  LOCAL_TTS_VOICE: optionalText,
  STT_PROVIDER: optionalText,
  STT_API_URL: optionalText,
  STT_API_KEY: optionalText,
  TTS_PROVIDER: optionalText,
  TTS_API_URL: optionalText,
  TTS_API_KEY: optionalText,
  TTS_VOICE_ID: optionalText,
  TTS_MODEL: optionalText,
  STT_MODEL: optionalText,
  AUDIOSOCKET_HOST: z.string().trim().default("127.0.0.1"),
  AUDIOSOCKET_PORT: z.coerce.number().int().min(1).max(65535).default(9019),
  FCM_PROJECT_ID: optionalText,
  FCM_CLIENT_EMAIL: optionalText,
  FCM_PRIVATE_KEY: optionalText,
  PHONE_AI_ENABLED: z.enum(["true", "false"]).default("false"),
  PHONE_AI_DEVELOPMENT_MODE: z.enum(["true", "false"]).default("true"),
});

function blankToUndefined(env) {
  const next = {};
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string" && value.trim() === "") continue;
    next[key] = value;
  }
  return next;
}

export function resetEnvCache() {
  cache = undefined;
}

export function getEnv() {
  if (cache) return cache;
  loadEnvFiles();
  const parsed = envSchema.safeParse(blankToUndefined(process.env));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
    throw new Error(`Invalid environment configuration: ${fields}`);
  }
  const value = parsed.data;
  cache = {
    ...value,
    trustProxy: value.TRUST_PROXY === "true",
    allowRegistration: value.ALLOW_REGISTRATION === "true",
    phoneAiEnabled: value.PHONE_AI_ENABLED === "true",
    developmentMode: value.PHONE_AI_DEVELOPMENT_MODE === "true",
  };
  return cache;
}
