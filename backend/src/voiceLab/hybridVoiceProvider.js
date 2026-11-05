import { GeminiLiveProvider } from "./geminiLiveProvider.js";
import { ModularVoiceProvider } from "./modularVoiceProvider.js";

export class HybridVoiceProvider {
  constructor(deps = {}) {
    this.name = "hybrid";
    this.live = deps.live || new GeminiLiveProvider(deps);
    this.modular = deps.modular || new ModularVoiceProvider(deps);
    this.active = null;
    this.switching = false;
  }

  async start(session) {
    session.allowFallback = session.config.hybridFallback !== false;
    session.onEngineFailure = (message) => this.fallback(session, message);
    this.active = this.live;
    session.activeEngine = "gemini-live";
    try {
      await this.live.start(session);
    } catch (error) {
      if (!session.allowFallback) throw error;
      await this.fallback(session, error.message);
    }
  }

  async fallback(session, message) {
    if (this.switching || this.active === this.modular) return;
    this.switching = true;
    try {
      await this.live.stop(session);
      this.active = this.modular;
      session.activeEngine = "modular";
      session.fallbackReason = message;
      await this.modular.start(session);
      session.emit?.({ type: "engine", engine: "modular", reason: message });
    } finally {
      this.switching = false;
    }
  }

  sendAudio(session, pcm, sampleRate) {
    this.active?.sendAudio(session, pcm, sampleRate);
  }

  endUtterance(session) {
    return this.active?.endUtterance?.(session);
  }

  interrupt(session) {
    return this.active?.interrupt?.(session);
  }

  async stop(session) {
    session.allowFallback = false;
    await this.live.stop(session);
    await this.modular.stop(session);
  }
}
