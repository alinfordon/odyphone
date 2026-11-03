import { getEnv } from "../config/env.js";
import { logger } from "../config/logger.js";
import { voiceRuntime } from "../audio/voiceRuntime.js";
import { ariRuntime } from "../telephony/ariEvents.js";
import { describeSip } from "./productionReadiness.js";

export function telephonyHealthState() {
  if (ariRuntime.connected) return "connected";
  if (ariRuntime.configured) return "disconnected";
  return "not_connected";
}

export function startProductionMonitor({ intervalMs = 60000 } = {}) {
  if (process.env.NODE_ENV === "test") return { stop() {} };
  const timer = setInterval(() => {
    const env = getEnv();
    const sip = describeSip({ env, ariConnected: ariRuntime.connected });
    logger.info(
      {
        monitor: "ody-phone",
        telephony: telephonyHealthState(),
        voiceListening: voiceRuntime.listening === true,
        sip: sip.state,
        developmentMode: env.developmentMode,
      },
      "production monitor",
    );
  }, intervalMs);
  timer.unref?.();
  return {
    stop() {
      clearInterval(timer);
    },
  };
}
