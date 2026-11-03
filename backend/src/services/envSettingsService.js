import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { envFilePath, getEnv, resetEnvCache } from "../config/env.js";
import { resetAsteriskCache } from "./statusService.js";
import { ApiError } from "../utils/errors.js";

const GROUPS = [
  {
    id: "server",
    title: "Server",
    note: "Aceste valori se citesc la pornirea API-ului. Nu se schimbă din panou.",
    fields: [
      { key: "NODE_ENV", label: "Mediu", kind: "readonly" },
      { key: "PORT", label: "Port API", kind: "readonly" },
      { key: "FRONTEND_URL", label: "Adresa panoului", kind: "readonly" },
      { key: "BACKEND_URL", label: "Adresa API", kind: "readonly" },
      { key: "MONGODB_URI", label: "Bază de date", kind: "redacted" },
      { key: "JWT_SECRET", label: "Secret JWT", kind: "secret", editable: false },
      { key: "JWT_REFRESH_SECRET", label: "Secret de reîmprospătare", kind: "secret", editable: false },
      { key: "TRUST_PROXY", label: "Proxy de încredere", kind: "readonly" },
      { key: "LOG_LEVEL", label: "Nivel jurnal", kind: "readonly" },
    ],
  },
  {
    id: "account",
    title: "Cont și mod de lucru",
    note: "Se aplică la următoarea cerere. Răspunsul AI al contului curent rămâne comutatorul de mai sus.",
    fields: [
      { key: "ALLOW_REGISTRATION", label: "Înregistrare deschisă după primul cont", kind: "boolean", editable: true },
      { key: "PHONE_AI_ENABLED", label: "Răspuns AI implicit pentru un cont nou", kind: "boolean", editable: true },
      { key: "PHONE_AI_DEVELOPMENT_MODE", label: "Mod de dezvoltare", kind: "boolean", editable: true },
    ],
  },
  {
    id: "asterisk",
    title: "Asterisk",
    note: "Respingerea și închiderea unui canal real sunt posibile. AI preia canalul doar când AudioSocket ascultă și furnizorii vocali sunt configurați. Sunarea proprietarului cere șablonul de trunchi.",
    fields: [
      { key: "ASTERISK_ARI_URL", label: "Adresă ARI", kind: "text", editable: true, url: true, max: 300 },
      { key: "ASTERISK_ARI_USERNAME", label: "Utilizator ARI", kind: "text", editable: true, max: 120 },
      { key: "ASTERISK_ARI_PASSWORD", label: "Parolă ARI", kind: "secret", editable: true, max: 300 },
      { key: "ASTERISK_APP_NAME", label: "Nume aplicație", kind: "text", editable: true, max: 80 },
      { key: "ASTERISK_TRUNK_ENDPOINT", label: "Șablon trunchi", kind: "text", editable: true, max: 120 },
    ],
  },
  {
    id: "gemini",
    title: "Gemini",
    note: "Cheia nu este afișată și nu este salvată în baza de date.",
    fields: [
      { key: "GEMINI_API_URL", label: "Adresă API", kind: "text", editable: true, url: true, max: 300 },
      { key: "GEMINI_API_KEY", label: "Cheie API", kind: "secret", editable: true, max: 500 },
      { key: "GEMINI_MODEL", label: "Model", kind: "text", editable: true, max: 120 },
    ],
  },
  {
    id: "stt",
    title: "Recunoașterea vorbirii",
    fields: [
      { key: "STT_PROVIDER", label: "Furnizor", kind: "text", editable: true, max: 80 },
      { key: "STT_API_URL", label: "Adresă API", kind: "text", editable: true, url: true, max: 300 },
      { key: "STT_API_KEY", label: "Cheie API", kind: "secret", editable: true, max: 500 },
      { key: "STT_MODEL", label: "Model", kind: "text", editable: true, max: 120 },
    ],
  },
  {
    id: "tts",
    title: "Sinteză vocală",
    fields: [
      { key: "TTS_PROVIDER", label: "Furnizor", kind: "text", editable: true, max: 80 },
      { key: "TTS_API_URL", label: "Adresă API", kind: "text", editable: true, url: true, max: 300 },
      { key: "TTS_API_KEY", label: "Cheie API", kind: "secret", editable: true, max: 500 },
      { key: "TTS_VOICE_ID", label: "Identificator voce", kind: "text", editable: true, max: 120 },
      { key: "TTS_MODEL", label: "Model", kind: "text", editable: true, max: 120 },
    ],
  },
  {
    id: "audio",
    title: "Adaptor audio",
    note: "Adresa se aplică la repornirea API-ului. Asterisk trebuie să poată deschide această adresă.",
    fields: [
      { key: "AUDIOSOCKET_HOST", label: "Adresă AudioSocket", kind: "text", editable: true, host: true, max: 253 },
      { key: "AUDIOSOCKET_PORT", label: "Port AudioSocket", kind: "text", editable: true, port: true, max: 5 },
    ],
  },
  {
    id: "fcm",
    title: "Notificări push",
    note: "Push-ul pleacă către dispozitivele înregistrate când cele trei valori sunt setate. Cheia nu este afișată.",
    fields: [
      { key: "FCM_PROJECT_ID", label: "ID proiect", kind: "text", editable: true, max: 200 },
      { key: "FCM_CLIENT_EMAIL", label: "Email client", kind: "text", editable: true, max: 200 },
      { key: "FCM_PRIVATE_KEY", label: "Cheie privată", kind: "secret", editable: true, max: 8000 },
    ],
  },
];

const EDITABLE = new Map(
  GROUPS.flatMap((group) => group.fields)
    .filter((field) => field.editable)
    .map((field) => [field.key, field]),
);

function isSet(value) {
  return value != null && String(value) !== "";
}

function publicMongo(uri) {
  try {
    const url = new URL(String(uri));
    const database = url.pathname.replace(/^\//, "").split("?")[0];
    const port = url.port ? `:${url.port}` : "";
    return `${url.hostname}${port}${database ? `/${database}` : ""}`;
  } catch {
    return "configurat";
  }
}

function present(field, env) {
  const raw = env[field.key];
  const set = isSet(raw);
  if (field.kind === "secret") {
    return { key: field.key, label: field.label, hint: fieldHint(field), kind: "secret", value: null, set, editable: Boolean(field.editable) };
  }
  if (field.kind === "redacted") {
    return { key: field.key, label: field.label, hint: fieldHint(field), kind: "readonly", value: set ? publicMongo(raw) : "", set, editable: false };
  }
  return {
    key: field.key,
    label: field.label,
    hint: fieldHint(field),
    kind: field.kind === "boolean" ? "boolean" : field.editable ? "text" : "readonly",
    value: set ? String(raw) : "",
    set,
    editable: Boolean(field.editable) && field.kind !== "readonly",
  };
}

function fieldHint(field) {
  if (field.kind === "secret" && field.editable) return "Lasă gol ca să păstrezi valoarea actuală.";
  if (field.key === "PHONE_AI_ENABLED") return "Se folosește doar când se creează setările unui cont nou.";
  if (field.key === "ASTERISK_TRUNK_ENDPOINT") return "Conține {number}. Exemplu: PJSIP/{number}@trunk. Gol înseamnă că nu se sună nimeni.";
  if (field.key === "AUDIOSOCKET_HOST") return "Implicit 127.0.0.1. Se aplică după repornirea API-ului.";
  if (field.key === "AUDIOSOCKET_PORT") return "Implicit 9019. Se aplică după repornirea API-ului.";
  if (field.key === "STT_PROVIDER") return "whisper sau openai pentru transcrierea compatibilă Whisper. Alt nume primește un POST audio/wav.";
  if (field.key === "TTS_PROVIDER") return "openai sau elevenlabs. Alt nume trebuie să întoarcă WAV.";
  if (field.url) return "Adresă http sau https. Golește câmpul ca să o ștergi.";
  return "";
}

export function buildEnvView(env) {
  return GROUPS.map((group) => ({
    id: group.id,
    title: group.title,
    note: group.note || "",
    fields: group.fields.map((field) => present(field, env)),
  }));
}

export function describeEnvironment() {
  return buildEnvView(getEnv());
}

export function formatEnvValue(value) {
  const text = String(value ?? "");
  if (text === "") return "";
  if (/[\s#"\\]/.test(text) || text.includes("\n")) {
    return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
  }
  return text;
}

export function mergeEnvText(source, changes) {
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const seen = new Set();
  const next = lines.map((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || !Object.hasOwn(changes, match[1])) return line;
    seen.add(match[1]);
    return `${match[1]}=${formatEnvValue(changes[match[1]])}`;
  });
  for (const [key, value] of Object.entries(changes)) {
    if (!seen.has(key)) next.push(`${key}=${formatEnvValue(value)}`);
  }
  return `${next.join(newline)}${newline}`;
}

function readUpdate(body) {
  const source = body && typeof body === "object" ? body : {};
  const values = source.values && typeof source.values === "object" && !Array.isArray(source.values) ? source.values : {};
  const clear = Array.isArray(source.clear) ? source.clear.filter((key) => typeof key === "string") : [];
  return { values, clear };
}

export function normalizeEnvUpdate(current, body) {
  const { values, clear } = readUpdate(body);
  const changes = {};
  for (const key of clear) {
    const field = EDITABLE.get(key);
    if (!field || field.kind !== "secret") {
      throw new ApiError(400, "Poți șterge doar o valoare secretă configurabilă.", "VALIDATION_ERROR");
    }
    changes[key] = "";
  }
  for (const key of Object.keys(values)) {
    const field = EDITABLE.get(key);
    if (!field) throw new ApiError(400, "Această valoare din mediu nu se modifică din panou.", "VALIDATION_ERROR");
    const incoming = values[key];
    if (typeof incoming !== "string") throw new ApiError(400, "Valoarea din mediu trebuie să fie text.", "VALIDATION_ERROR");
    if (field.kind === "secret") {
      const next = incoming.trim();
      if (!next) continue;
      if (next.length > field.max) throw new ApiError(400, `${field.label} este prea lung.`, "VALIDATION_ERROR");
      changes[key] = next;
      continue;
    }
    if (field.kind === "boolean") {
      if (incoming !== "true" && incoming !== "false") {
        throw new ApiError(400, `${field.label} trebuie să fie pornit sau oprit.`, "VALIDATION_ERROR");
      }
      changes[key] = incoming;
      continue;
    }
    const text = incoming.trim();
    if (text.length > (field.max || 300)) throw new ApiError(400, `${field.label} este prea lung.`, "VALIDATION_ERROR");
    if (field.url && text && !/^https?:\/\//i.test(text)) {
      throw new ApiError(400, `${field.label} trebuie să înceapă cu http:// sau https://.`, "VALIDATION_ERROR");
    }
    if (field.host && text && !/^[A-Za-z0-9.-]{1,253}$/.test(text)) {
      throw new ApiError(400, `${field.label} trebuie să fie un nume sau o adresă IP.`, "VALIDATION_ERROR");
    }
    if (field.port && text && !/^([1-9]\d{0,3}|[1-5]\d{4}|6[0-4]\d{3}|65[0-4]\d{2}|655[0-2]\d|6553[0-5])$/.test(text)) {
      throw new ApiError(400, `${field.label} trebuie să fie un port între 1 și 65535.`, "VALIDATION_ERROR");
    }
    changes[key] = text;
  }
  const diff = {};
  for (const [key, value] of Object.entries(changes)) {
    const existing = isSet(current[key]) ? String(current[key]) : "";
    if (existing !== value) diff[key] = value;
  }
  return diff;
}

export function updateEnvironment(body) {
  const current = getEnv();
  const changes = normalizeEnvUpdate(current, body);
  const changed = Object.keys(changes);
  if (changed.length === 0) return { groups: buildEnvView(current), changed };
  if (process.env.NODE_ENV === "test") {
    throw new ApiError(400, "Fișierul de mediu nu se modifică în timpul testelor.", "ENV_LOCKED");
  }
  const file = envFilePath();
  const source = existsSync(file) ? readFileSync(file, "utf8") : "";
  writeFileSync(file, mergeEnvText(source, changes), "utf8");
  for (const [key, value] of Object.entries(changes)) {
    if (value === "") delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
  if (changed.some((key) => key.startsWith("ASTERISK_"))) resetAsteriskCache();
  return { groups: buildEnvView(getEnv()), changed };
}
