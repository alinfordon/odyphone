import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { toPhonePcm } from "../audio/pcm.js";

const REPEAT = "Nu am înțeles. Puteți repeta, vă rog?";

export class SpeechRecognitionProvider {
  constructor(fetchImpl = globalThis.fetch) {
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    const env = getEnv();
    return Boolean(env.STT_PROVIDER && env.STT_API_KEY && env.STT_API_URL);
  }

  describe() {
    const env = getEnv();
    return {
      provider: env.STT_PROVIDER || "unspecified",
      configured: this.isConfigured(),
      streaming: false,
      language: "ro",
      message: this.isConfigured()
        ? "Frazele în limba română sunt trimise către furnizorul configurat. Fluxul audio le taie la liniște, nu cuvânt cu cuvânt."
        : "Recunoașterea vorbirii nu este configurată.",
    };
  }

  async transcribe({ wav, signal, language = "ro" } = {}) {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new ApiError(501, "Recunoașterea vorbirii nu este configurată.", "STT_NOT_CONNECTED");
    }
    if (!wav?.length) {
      return { text: "", provider: env.STT_PROVIDER };
    }
    const provider = env.STT_PROVIDER.toLowerCase();
    const response = provider === "openai" || provider === "whisper"
      ? await this.whisper(env, wav, signal, language)
      : await this.fetchImpl(env.STT_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.STT_API_KEY}`,
            "Content-Type": "audio/wav",
            "X-Language": language,
          },
          body: wav,
          signal,
        });
    if (!response.ok) {
      throw new ApiError(502, "Recunoașterea vorbirii a eșuat. Nu a fost inventat niciun text.", "STT_PROVIDER_ERROR");
    }
    const payload = await response.json().catch(() => ({}));
    const text = String(payload.text || payload.transcript || "").trim();
    return { text, provider: env.STT_PROVIDER };
  }

  whisper(env, wav, signal, language = "ro") {
    const form = new FormData();
    form.set("file", new Blob([new Uint8Array(wav)], { type: "audio/wav" }), "caller.wav");
    form.set("model", env.STT_MODEL || "whisper-1");
    form.set("language", language);
    return this.fetchImpl(env.STT_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.STT_API_KEY}` },
      body: form,
      signal,
    });
  }
}

export const speechRecognitionProvider = new SpeechRecognitionProvider();

export class TextToSpeechProvider {
  constructor(fetchImpl = globalThis.fetch) {
    this.fetchImpl = fetchImpl;
  }

  isConfigured() {
    const env = getEnv();
    return Boolean(env.TTS_PROVIDER && env.TTS_API_KEY && env.TTS_API_URL);
  }

  describe() {
    const env = getEnv();
    return {
      provider: env.TTS_PROVIDER || "unspecified",
      configured: this.isConfigured(),
      voiceConfigured: Boolean(env.TTS_VOICE_ID),
      streaming: false,
      language: "ro",
      message: this.isConfigured()
        ? "Răspunsul este sintetizat și transformat în audio de 8 kHz pentru telefon."
        : "Sinteza vocală nu este configurată.",
    };
  }

  async synthesize(text, { signal, language = "ro", voiceId } = {}) {
    const env = getEnv();
    if (!this.isConfigured()) {
      throw new ApiError(501, "Sinteza vocală nu este configurată.", "TTS_NOT_CONNECTED");
    }
    const spoken = String(text || "").trim().slice(0, 500);
    if (!spoken) throw new ApiError(400, "Nu există text de rostit.", "TTS_EMPTY");
    const provider = env.TTS_PROVIDER.toLowerCase();
    const response = provider === "elevenlabs"
      ? await this.eleven(env, spoken, signal, voiceId)
      : await this.speech(env, spoken, signal, provider, language, voiceId);
    if (!response.ok) {
      throw new ApiError(502, "Sinteza vocală a eșuat. Nu a fost redat niciun sunet inventat.", "TTS_PROVIDER_ERROR");
    }
    const audio = Buffer.from(await response.arrayBuffer());
    const mime = response.headers.get("content-type") || (provider === "elevenlabs" ? "audio/pcm" : "audio/wav");
    try {
      return { pcm: toPhonePcm(audio, mime), provider: env.TTS_PROVIDER };
    } catch {
      throw new ApiError(502, "Sinteza a întors un format care nu poate fi pus pe linie. Cere WAV sau PCM de 8 kHz.", "TTS_FORMAT");
    }
  }

  speech(env, text, signal, provider, language = "ro", voiceId) {
    const openai = provider === "openai";
    const voice = voiceId || env.TTS_VOICE_ID || (openai ? "alloy" : "");
    return this.fetchImpl(env.TTS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.TTS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "audio/wav",
      },
      body: JSON.stringify(openai
        ? {
            model: env.TTS_MODEL || "tts-1",
            input: text,
            voice,
            response_format: "wav",
          }
        : {
            text,
            language,
            voiceId: voice,
            format: "wav",
          }),
      signal,
    });
  }

  eleven(env, text, signal, voiceId) {
    const voice = voiceId || env.TTS_VOICE_ID || "";
    const base = env.TTS_API_URL.replace(/\/$/, "");
    const url = voice && !base.endsWith(`/${voice}`) ? `${base}/${encodeURIComponent(voice)}` : base;
    const target = `${url}${url.includes("?") ? "&" : "?"}output_format=pcm_8000`;
    return this.fetchImpl(target, {
      method: "POST",
      headers: {
        "xi-api-key": env.TTS_API_KEY,
        "Content-Type": "application/json",
        Accept: "application/octet-stream",
      },
      body: JSON.stringify({
        text,
        model_id: env.TTS_MODEL || "eleven_multilingual_v2",
      }),
      signal,
    });
  }
}

export const textToSpeechProvider = new TextToSpeechProvider();

export function createConversation({ llm, stt, tts, instructions, responseTimeoutMs = 8000 }) {
  const history = [];
  let controller = null;

  function interrupt() {
    controller?.abort();
  }

  async function speak(text, signal) {
    const spoken = await tts.synthesize(text, { signal });
    return spoken.pcm;
  }

  return {
    history,
    interrupt,
    async greeting(text) {
      const pcm = await speak(text);
      history.push({ role: "model", text });
      return { text, pcm };
    },
    async replyToWav(wav) {
      controller?.abort();
      controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(responseTimeoutMs),
      ]);
      try {
        const heard = await stt.transcribe({ wav, signal });
        const text = heard.text.trim();
        if (!text) return { empty: true, pcm: await speak(REPEAT, signal), reply: REPEAT };
        history.push({ role: "user", text });
        const generated = await llm.generate({
          system: `${instructions}\n\nRăspunde acum, în limba română, în cel mult două propoziții. Nu aștepta sfârșitul conversației. Dacă apelantul își ia rămas bun, încheie politicos.`,
          history: history.slice(0, -1),
          user: text,
          signal,
        });
        const reply = String(generated.text || "").trim();
        if (!reply) return { empty: true, text, pcm: await speak(REPEAT, signal), reply: REPEAT };
        history.push({ role: "model", text: reply });
        const pcm = await speak(reply, signal);
        const endCall = /\b(la revedere|pa pa|am terminat)\b/i.test(text);
        return { text, reply, pcm, endCall };
      } finally {
        controller = null;
      }
    },
  };
}
