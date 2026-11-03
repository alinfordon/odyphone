import { getEnv } from "../config/env.js";
import { describeVoice, voiceCanAnswer } from "../audio/voiceRuntime.js";
import { ariRuntime } from "../telephony/ariEvents.js";
import { recordingWarning } from "./settingsService.js";
import { fcmStatus } from "./notificationService.js";
import { describeSip } from "./productionReadiness.js";

let asteriskCache = { at: 0, value: null };

function providerStatus(name, configured) {
  return {
    provider: name,
    configured: Boolean(configured),
    live: false,
  };
}

export async function probeAsterisk() {
  const now = Date.now();
  if (asteriskCache.value && now - asteriskCache.at < 15000) return asteriskCache.value;
  const env = getEnv();
  let value;
  if (!env.ASTERISK_ARI_URL || !env.ASTERISK_ARI_USERNAME || !env.ASTERISK_ARI_PASSWORD) {
    value = {
      ok: false,
      state: "not_configured",
      live: false,
      control: "off",
      message: "ARI Asterisk nu este configurat.",
    };
  } else {
    try {
      const base = env.ASTERISK_ARI_URL.replace(/\/$/, "");
      const response = await fetch(`${base}/asterisk/info`, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${env.ASTERISK_ARI_USERNAME}:${env.ASTERISK_ARI_PASSWORD}`).toString("base64")}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4000),
      });
      value = response.ok
        ? {
            ok: true,
            state: "reachable",
            live: false,
            control: ariRuntime.connected ? "events" : "health_only",
            message: voiceCanAnswer(env)
              ? "ARI este conectat. AI poate prelua canalul prin AudioSocket."
              : ariRuntime.connected
                ? "ARI răspunde, iar evenimentele sunt conectate. AI nu preia canalul până când vocea este gata."
                : "ARI a răspuns la o verificare doar de citire. AI nu preia canalul.",
          }
        : {
            ok: false,
            state: "rejected",
            live: false,
            control: "health_only",
            message: "ARI a refuzat verificarea.",
          };
    } catch {
      value = {
        ok: false,
        state: "unreachable",
        live: false,
        control: "health_only",
        message: "ARI este configurat și nu a răspuns.",
      };
    }
  }
  asteriskCache = { at: now, value };
  return value;
}

export async function getSystemStatus(settings) {
  const env = getEnv();
  const asterisk = await probeAsterisk();
  return {
    api: "up",
    developmentMode: env.developmentMode,
    aiAnsweringEnabled: settings.aiAnsweringEnabled,
    asterisk,
    sip: describeSip({ env, ariConnected: ariRuntime.connected }),
    ai: {
      llm: providerStatus("gemini", env.GEMINI_API_KEY && env.GEMINI_API_URL),
      stt: providerStatus(env.STT_PROVIDER || "unspecified", env.STT_API_KEY && env.STT_API_URL),
      tts: providerStatus(env.TTS_PROVIDER || "unspecified", env.TTS_API_KEY && env.TTS_API_URL),
    },
    fcm: fcmStatus(),
    voicePipeline: describeVoice(env),
    ariEvents: {
      configured: ariRuntime.configured,
      connected: ariRuntime.connected,
      detail: ariRuntime.detail,
    },
    recording: {
      requested: settings.recordingEnabled,
      active: false,
      message: recordingWarning(settings),
    },
  };
}

export function resetAsteriskCache() {
  asteriskCache = { at: 0, value: null };
}
