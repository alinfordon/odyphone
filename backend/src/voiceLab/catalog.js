import { geminiProvider } from "../ai/GeminiProvider.js";
import { speechRecognitionProvider } from "../ai/SpeechRecognitionProvider.js";
import { textToSpeechProvider } from "../ai/TextToSpeechProvider.js";
import { getEnv } from "../config/env.js";
import { geminiLiveConfigured, LIVE_VOICES } from "./geminiLiveProvider.js";
import { listOllamaModels } from "./ollamaProvider.js";

const MODULAR_VOICES = ["alloy", "nova", "shimmer", "echo", "onyx", "fable"];

export async function voiceLabStatus({ env = getEnv(), listModels = listOllamaModels } = {}) {
  let ollama = { reachable: false, configured: Boolean(env.OLLAMA_BASE_URL), local: 0, cloud: 0 };
  if (env.OLLAMA_BASE_URL) {
    try {
      const models = await listModels({ env });
      ollama = {
        reachable: models.reachable,
        configured: true,
        local: models.local.length,
        cloud: models.cloud.length,
      };
    } catch (error) {
      ollama = { reachable: false, configured: true, local: 0, cloud: 0, message: error.message };
    }
  }
  return {
    engines: [
      {
        id: "gemini-live",
        label: "Gemini Live",
        configured: geminiLiveConfigured(env),
        detail: geminiLiveConfigured(env)
          ? "Conversație audio nativă. Nu a fost verificată cu un apel real către Gemini din acest mediu până la un test manual."
          : "Lipsește cheia Gemini.",
      },
      {
        id: "modular",
        label: "Modular Voice",
        configured: true,
        detail: "Microfon, recunoaștere, model, sinteză. Fiecare provider trebuie să fie configurat.",
      },
      {
        id: "hybrid",
        label: "Hybrid Voice",
        configured: geminiLiveConfigured(env),
        detail: "Gemini Live este principal. La eroare poate trece o singură dată la Modular Voice.",
      },
    ],
    llm: [
      { id: "gemini", label: "Gemini", configured: geminiProvider.isConfigured() },
      { id: "ollama", label: "Ollama", configured: Boolean(env.OLLAMA_BASE_URL), reachable: ollama.reachable },
    ],
    stt: [
      {
        id: "configured",
        label: "Furnizorul din mediu",
        configured: speechRecognitionProvider.isConfigured(),
        provider: env.STT_PROVIDER || "",
      },
      {
        id: "local",
        label: "STT local HTTP",
        configured: Boolean(env.LOCAL_STT_URL),
        detail: "Așteaptă un serviciu compatibil faster-whisper. Nu este instalat automat.",
      },
    ],
    tts: [
      {
        id: "configured",
        label: "Furnizorul din mediu",
        configured: textToSpeechProvider.isConfigured(),
        provider: env.TTS_PROVIDER || "",
      },
      {
        id: "local",
        label: "TTS local HTTP",
        configured: Boolean(env.LOCAL_TTS_URL),
        detail: "Așteaptă WAV. Nu este instalat automat.",
      },
    ],
    languages: [
      { id: "ro", label: "Română" },
      { id: "en", label: "Engleză" },
    ],
    voices: {
      live: LIVE_VOICES,
      modular: MODULAR_VOICES,
    },
    ollama,
    hybridFallbackDefault: true,
  };
}
