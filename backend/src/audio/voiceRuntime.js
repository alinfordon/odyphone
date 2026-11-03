export const voiceRuntime = {
  listening: false,
  host: "127.0.0.1",
  port: 9019,
  detail: "Adaptorul AudioSocket nu ascultă. AI nu preia canalul.",
  active: 0,
  server: null,
  stop: null,
  pending: new Map(),
  hold(uuid, session) {
    this.pending.set(uuid, session);
  },
  take(uuid) {
    const session = this.pending.get(uuid);
    if (session) this.pending.delete(uuid);
    return session || null;
  },
  release(uuid) {
    this.pending.delete(uuid);
  },
};

export function voiceProvidersReady(env) {
  return Boolean(
    env?.STT_PROVIDER && env.STT_API_URL && env.STT_API_KEY
    && env?.TTS_PROVIDER && env.TTS_API_URL && env.TTS_API_KEY
    && env?.GEMINI_API_KEY && env.GEMINI_API_URL && env.GEMINI_MODEL,
  );
}

export function voiceCanAnswer(env) {
  return voiceRuntime.listening && voiceProvidersReady(env);
}

export function describeVoice(env) {
  const providers = voiceProvidersReady(env);
  const connected = voiceRuntime.listening && providers;
  let message = "Fluxul audio nu este conectat. AI nu preia canalul.";
  if (connected) {
    message = `Calea vocală este gata. AudioSocket ascultă pe ${voiceRuntime.host}:${voiceRuntime.port}.`;
  } else if (voiceRuntime.listening) {
    message = "AudioSocket ascultă, dar lipsește recunoașterea, sinteza sau Gemini. AI nu preia canalul.";
  } else if (providers) {
    message = "Furnizorii vocali sunt configurați, dar AudioSocket nu ascultă. AI nu preia canalul.";
  }
  return {
    connected,
    listening: voiceRuntime.listening,
    host: voiceRuntime.host,
    port: voiceRuntime.port,
    activeSessions: voiceRuntime.active,
    message,
  };
}
