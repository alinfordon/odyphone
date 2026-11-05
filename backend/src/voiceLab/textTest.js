import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { publicError } from "./errors.js";
import { classifyOllamaModel, generateOllama, listOllamaModels } from "./ollamaProvider.js";

async function geminiText({ prompt, system, env, fetchImpl }) {
  const started = Date.now();
  const base = env.GEMINI_API_URL.replace(/\/$/, "");
  const response = await fetchImpl(`${base}/models/${encodeURIComponent(env.GEMINI_MODEL)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(env.OLLAMA_TIMEOUT_MS || 20000),
  });
  if (!response.ok) {
    throw new ApiError(502, "Gemini a întors o eroare. Nu a fost inventat niciun răspuns.", "AI_PROVIDER_ERROR");
  }
  const raw = await response.text();
  let text = "";
  let firstTokenMs = null;
  for (const line of raw.split("\n")) {
    const data = line.startsWith("data:") ? line.slice(5).trim() : "";
    if (!data || data === "[DONE]") continue;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      continue;
    }
    const piece = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";
    if (piece && firstTokenMs === null) firstTokenMs = Date.now() - started;
    text += piece;
  }
  text = text.trim();
  if (!text) throw new ApiError(502, "Gemini a întors un răspuns gol.", "AI_PROVIDER_ERROR");
  return {
    text,
    provider: "gemini",
    model: env.GEMINI_MODEL,
    cloud: true,
    local: false,
    firstTokenMs,
    totalMs: Date.now() - started,
  };
}

export async function runTextTest({ llm, model, prompt, system, fetchImpl = fetch, env = getEnv(), listModels = listOllamaModels } = {}) {
  try {
    if (llm === "gemini") {
      if (!env.GEMINI_API_KEY || !env.GEMINI_API_URL || !env.GEMINI_MODEL) {
        throw new ApiError(501, "Gemini nu este configurat pentru text.", "AI_NOT_CONFIGURED");
      }
      return await geminiText({ prompt, system, env, fetchImpl });
    }
    const discovered = await listModels({ fetchImpl, env });
    const known = [...discovered.local, ...discovered.cloud];
    const chosen = known.find((item) => item.name === model) || classifyOllamaModel({ name: model });
    if (!known.some((item) => item.name === model)) {
      throw new ApiError(400, "Modelul nu este în lista descoperită de la Ollama.", "OLLAMA_MODEL");
    }
    const generated = await generateOllama({ model, system, user: prompt, fetchImpl, env });
    return {
      text: generated.text,
      provider: "ollama",
      model,
      cloud: chosen.cloud,
      local: chosen.local,
      processedOnPc: chosen.local,
      firstTokenMs: generated.firstTokenMs,
      totalMs: generated.totalMs,
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, publicError(error), "TEXT_TEST_FAILED");
  }
}
