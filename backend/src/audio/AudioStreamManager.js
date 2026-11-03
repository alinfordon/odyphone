import { voiceRuntime, describeVoice } from "./voiceRuntime.js";
import { getEnv } from "../config/env.js";

export class AudioStreamManager {
  describe() {
    const voice = describeVoice(getEnv());
    return {
      connected: voice.connected,
      listening: voice.listening,
      inbound: "SIP/RTP → Asterisk → AudioSocket → recunoașterea vorbirii",
      outbound: "Textul asistentului → sinteză vocală → AudioSocket → Asterisk → apelant",
      message: voice.message,
    };
  }
}

export class VoiceActivityDetector {
  describe(settings) {
    return {
      active: voiceRuntime.listening,
      silenceMs: settings?.silenceMs ?? 700,
      message: voiceRuntime.listening
        ? "Liniștea configurată încheie fraza apelantului pe fluxul audio."
        : "Detectarea sfârșitului vorbirii așteaptă adaptorul AudioSocket.",
    };
  }
}

export class CallSessionManager {
  describe() {
    return {
      activeSessions: voiceRuntime.active,
      live: voiceRuntime.active > 0,
      message: voiceRuntime.active > 0
        ? "Există o sesiune audio deschisă."
        : "Nu este deschisă nicio sesiune audio de apel.",
    };
  }
}

export const audioStreamManager = new AudioStreamManager();
export const voiceActivityDetector = new VoiceActivityDetector();
export const callSessionManager = new CallSessionManager();
