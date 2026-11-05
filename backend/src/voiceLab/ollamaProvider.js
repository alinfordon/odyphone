import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { publicError } from "./errors.js";

export function ollamaBaseUrl(env = getEnv()) {
  const raw = String(env.OLLAMA_BASE_URL || "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(500, "Adresa Ollama din configurație nu este validă.", "OLLAMA_CONFIG");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ApiError(500, "Adresa Ollama din configurație nu este validă.", "OLLAMA_CONFIG");
  }
  return url.href.replace(/\/$/, "");
}

export function classifyOllamaModel(model) {
  const name = String(model?.name || model?.model || "").trim();
  const remoteHost = String(model?.remote_host || "").trim();
  const remoteModel = String(model?.remote_model || "").trim();
  const cloud = Boolean(remoteHost || remoteModel || /(?:^|:)cloud$|-cloud\b/i.test(name));
  return {
    name,
    cloud,
    local: Boolean(name) && !cloud,
    size: Number(model?.size || 0),
    family: String(model?.details?.family || ""),
    parameterSize: String(model?.details?.parameter_size || ""),
  };
}

export function splitOllamaModels(models) {
  const local = [];
  const cloud = [];
  for (const model of Array.isArray(models) ? models : []) {
    const item = classifyOllamaModel(model);
    if (!item.name) continue;
    if (item.cloud) cloud.push(item);
    else local.push(item);
  }
  return { local, cloud };
}

export async function listOllamaModels({ fetchImpl = fetch, env = getEnv(), timeoutMs } = {}) {
  const base = ollamaBaseUrl(env);
  if (!base) {
    return { reachable: false, configured: false, local: [], cloud: [], selected: "" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || env.OLLAMA_TIMEOUT_MS || 20000);
  try {
    const response = await fetchImpl(`${base}/api/tags`, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(502, "Ollama a refuzat lista de modele.", "OLLAMA_UNAVAILABLE");
    }
    const payload = await response.json();
    const split = splitOllamaModels(payload?.models);
    const names = new Set([...split.local, ...split.cloud].map((item) => item.name));
    const preferred = String(env.OLLAMA_MODEL || "");
    return {
      reachable: true,
      configured: true,
      ...split,
      selected: names.has(preferred) ? preferred : "",
    };
  } catch (error) {
    if (error?.name === "AbortError" || error?.code === "ABORT_ERR") {
      throw new ApiError(504, "Ollama nu a răspuns la timp.", "OLLAMA_TIMEOUT");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Ollama nu răspunde din rețeaua locală.", "OLLAMA_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

function messagesFrom({ system, history, user }) {
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  for (const turn of history || []) {
    if (!turn?.text) continue;
    messages.push({ role: turn.role === "model" ? "assistant" : "user", content: String(turn.text) });
  }
  messages.push({ role: "user", content: user });
  return messages;
}

export async function readOllamaStream(response, startedAt = Date.now()) {
  if (!response.body?.getReader) {
    const payload = await response.json();
    const text = String(payload?.message?.content || "").trim();
    const totalMs = Date.now() - startedAt;
    return { text, firstTokenMs: text ? totalMs : null, totalMs };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let firstTokenMs = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const payload = JSON.parse(line);
      const piece = String(payload?.message?.content || "");
      if (piece && firstTokenMs === null) firstTokenMs = Date.now() - startedAt;
      text += piece;
    }
  }
  return { text: text.trim(), firstTokenMs, totalMs: Date.now() - startedAt };
}

export async function generateOllama({
  model,
  system,
  history = [],
  user,
  fetchImpl = fetch,
  env = getEnv(),
  timeoutMs,
  signal,
} = {}) {
  const base = ollamaBaseUrl(env);
  if (!base) {
    throw new ApiError(501, "Ollama nu este configurat.", "OLLAMA_NOT_CONFIGURED");
  }
  const chosen = String(model || env.OLLAMA_MODEL || "").trim();
  if (!chosen) {
    throw new ApiError(400, "Alege un model Ollama descoperit de server.", "OLLAMA_MODEL");
  }
  const timeout = timeoutMs || env.OLLAMA_TIMEOUT_MS || 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  const startedAt = Date.now();
  try {
    const response = await fetchImpl(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
      body: JSON.stringify({
        model: chosen,
        messages: messagesFrom({ system, history, user }),
        stream: true,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new ApiError(502, "Ollama a refuzat generarea.", "OLLAMA_ERROR");
    }
    const result = await readOllamaStream(response, startedAt);
    if (!result.text) {
      throw new ApiError(502, "Ollama a întors un răspuns gol.", "OLLAMA_EMPTY");
    }
    return { text: result.text, provider: "ollama", model: chosen, ...result };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ApiError(504, "Ollama nu a răspuns la timp.", "OLLAMA_TIMEOUT");
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, publicError(error), "OLLAMA_ERROR");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
