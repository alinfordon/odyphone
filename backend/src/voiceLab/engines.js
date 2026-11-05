import { ApiError } from "../utils/errors.js";
import { GeminiLiveProvider } from "./geminiLiveProvider.js";
import { HybridVoiceProvider } from "./hybridVoiceProvider.js";
import { ModularVoiceProvider } from "./modularVoiceProvider.js";

export function createVoiceEngine(kind, deps = {}) {
  if (kind === "gemini-live") return new GeminiLiveProvider(deps);
  if (kind === "modular") return new ModularVoiceProvider(deps);
  if (kind === "hybrid") return new HybridVoiceProvider(deps);
  throw new ApiError(400, "Motorul vocal nu este recunoscut.", "VOICE_ENGINE");
}
