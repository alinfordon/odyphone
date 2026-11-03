import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { LLMProvider } from "./LLMProvider.js";

export class GeminiProvider extends LLMProvider {
  constructor() {
    super("gemini");
  }

  isConfigured() {
    const env = getEnv();
    return Boolean(env.GEMINI_API_KEY && env.GEMINI_API_URL && env.GEMINI_MODEL);
  }

  async generate({ system, user, history = [], signal }) {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new ApiError(501, "Gemini nu este configurat. Setează GEMINI_API_URL, GEMINI_API_KEY și GEMINI_MODEL.", "AI_NOT_CONFIGURED");
    }
    const base = env.GEMINI_API_URL.replace(/\/$/, "");
    const contents = (Array.isArray(history) ? history : [])
      .filter((turn) => turn?.text)
      .map((turn) => ({
        role: turn.role === "model" ? "model" : "user",
        parts: [{ text: String(turn.text) }],
      }));
    if (contents[0]?.role === "model") {
      contents.unshift({ role: "user", parts: [{ text: "Apelul a început." }] });
    }
    contents.push({ role: "user", parts: [{ text: user }] });
    const response = await fetch(`${base}/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
      }),
      signal: signal || AbortSignal.timeout(20000),
    });
    if (!response.ok) {
      throw new ApiError(502, "Gemini a întors o eroare. Nu a fost inventat niciun răspuns.", "AI_PROVIDER_ERROR");
    }
    const payload = await response.json();
    const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim();
    if (!text) {
      throw new ApiError(502, "Gemini a întors un răspuns gol.", "AI_PROVIDER_ERROR");
    }
    return { text, provider: "gemini", model: env.GEMINI_MODEL };
  }
}

export const geminiProvider = new GeminiProvider();
