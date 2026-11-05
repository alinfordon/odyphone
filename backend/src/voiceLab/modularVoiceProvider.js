import { wrapPcmAsWav, parseWav } from "../audio/pcm.js";
import { createVad } from "../audio/vad.js";
import { geminiProvider } from "../ai/GeminiProvider.js";
import { speechRecognitionProvider } from "../ai/SpeechRecognitionProvider.js";
import { textToSpeechProvider } from "../ai/TextToSpeechProvider.js";
import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { publicError } from "./errors.js";
import { answerWithOdyIdentity, buildOdyContext } from "../odyCore/index.js";
import { generateOllama } from "./ollamaProvider.js";

function silencePcm(sampleRate, ms) {
  return Buffer.alloc(Math.floor(sampleRate * (ms / 1000)) * 2);
}

async function localTranscribe({ wav, language, fetchImpl, env }) {
  if (!env.LOCAL_STT_URL) {
    throw new ApiError(501, "STT local nu este configurat. Setează LOCAL_STT_URL către un serviciu HTTP compatibil cu faster-whisper.", "LOCAL_STT_NOT_CONFIGURED");
  }
  const headers = { "Content-Type": "audio/wav", "X-Language": language };
  if (env.LOCAL_STT_API_KEY) headers.Authorization = `Bearer ${env.LOCAL_STT_API_KEY}`;
  const response = await fetchImpl(env.LOCAL_STT_URL, { method: "POST", headers, body: wav });
  if (!response.ok) throw new ApiError(502, "STT local a eșuat.", "LOCAL_STT_ERROR");
  const payload = await response.json().catch(() => ({}));
  return { text: String(payload.text || payload.transcript || "").trim(), provider: "local" };
}

async function localSynthesize({ text, language, voice, fetchImpl, env }) {
  if (!env.LOCAL_TTS_URL) {
    throw new ApiError(501, "TTS local nu este configurat. Setează LOCAL_TTS_URL către un serviciu care întoarce WAV.", "LOCAL_TTS_NOT_CONFIGURED");
  }
  const headers = { "Content-Type": "application/json", Accept: "audio/wav" };
  if (env.LOCAL_TTS_API_KEY) headers.Authorization = `Bearer ${env.LOCAL_TTS_API_KEY}`;
  const response = await fetchImpl(env.LOCAL_TTS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({ text, language, voiceId: voice || env.LOCAL_TTS_VOICE || "", format: "wav" }),
  });
  if (!response.ok) throw new ApiError(502, "TTS local a eșuat.", "LOCAL_TTS_ERROR");
  const audio = Buffer.from(await response.arrayBuffer());
  const parsed = parseWav(audio);
  return { pcm: parsed.pcm.toString("base64"), sampleRate: parsed.sampleRate, provider: "local" };
}

async function configuredSynthesize({ text, language, voice, signal }) {
  const spoken = await textToSpeechProvider.synthesize(text, { signal, language, voiceId: voice });
  return { pcm: spoken.pcm.toString("base64"), sampleRate: 8000, provider: spoken.provider };
}

export class ModularVoiceProvider {
  constructor({ fetchImpl = fetch, llmGemini = geminiProvider, transcribe = null, env = null } = {}) {
    this.name = "modular";
    this.fetchImpl = fetchImpl;
    this.llmGemini = llmGemini;
    this.transcribe = transcribe;
    this.env = env;
    this.vad = createVad({ sampleRate: 16000, silenceMs: 700, minSpeechMs: 280 });
    this.busy = false;
    this.controller = null;
    this.stopped = false;
  }

  currentEnv() {
    return this.env || getEnv();
  }

  assertReady(session) {
    const env = this.currentEnv();
    if (session.config.llm === "ollama" && !env.OLLAMA_BASE_URL) {
      throw new ApiError(501, "Ollama nu este configurat.", "OLLAMA_NOT_CONFIGURED");
    }
    if (session.config.llm === "gemini" && !this.llmGemini.isConfigured()) {
      throw new ApiError(501, "Gemini nu este configurat pentru text.", "AI_NOT_CONFIGURED");
    }
    if (session.config.stt === "local" && !env.LOCAL_STT_URL) {
      throw new ApiError(501, "STT local nu este configurat.", "LOCAL_STT_NOT_CONFIGURED");
    }
    if (session.config.stt !== "local" && !speechRecognitionProvider.isConfigured()) {
      throw new ApiError(501, "Recunoașterea vorbirii nu este configurată.", "STT_NOT_CONNECTED");
    }
    if (session.config.tts === "local" && !env.LOCAL_TTS_URL) {
      throw new ApiError(501, "TTS local nu este configurat.", "LOCAL_TTS_NOT_CONFIGURED");
    }
    if (session.config.tts !== "local" && !textToSpeechProvider.isConfigured()) {
      throw new ApiError(501, "Sinteza vocală nu este configurată.", "TTS_NOT_CONNECTED");
    }
  }

  async start(session) {
    this.stopped = false;
    this.assertReady(session);
    session.connection = "open";
    session.emit?.({ type: "state", connection: "open", engine: this.name });
  }

  sendAudio(session, pcm) {
    if (this.stopped) return;
    const utterance = this.vad.push(Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm));
    if (utterance) this.finishUtterance(session, utterance);
  }

  async endUtterance(session) {
    const utterance = this.vad.push(silencePcm(16000, 800));
    if (utterance) await this.finishUtterance(session, utterance);
  }

  async hear({ wav, language, signal, session }) {
    if (this.transcribe) return this.transcribe({ wav, language, signal });
    const env = this.currentEnv();
    if (session?.config?.stt === "local") {
      return localTranscribe({ wav, language, fetchImpl: this.fetchImpl, env });
    }
    return speechRecognitionProvider.transcribe({ wav, signal, language });
  }

  async reply({ session, history, user, signal }) {
    const local = answerWithOdyIdentity(user, {
      record: session.odyContext,
      language: session.config.language,
      history,
      includeHistory: false,
      channel: "voice",
    });
    if (local) return { text: local, provider: "ody-core", model: "identity", firstTokenMs: 0, totalMs: 0 };
    const system = buildOdyContext({
      record: session.odyContext,
      language: session.config.language,
      includeHistory: false,
      channel: "voice",
    }).text;
    if (session.config.llm === "ollama") {
      return generateOllama({
        model: session.config.ollamaModel,
        system,
        history,
        user,
        fetchImpl: this.fetchImpl,
        env: this.currentEnv(),
        signal,
      });
    }
    const started = Date.now();
    const generated = await this.llmGemini.generate({ system, history, user, signal });
    const totalMs = Date.now() - started;
    return { ...generated, firstTokenMs: totalMs, totalMs };
  }

  async finishUtterance(session, pcm) {
    if (this.busy || this.stopped) return;
    this.busy = true;
    this.controller = new AbortController();
    const started = Date.now();
    const signal = this.controller.signal;
    try {
      const wav = wrapPcmAsWav(pcm, 16000);
      const sttStarted = Date.now();
      const heard = await this.hear({ wav, language: session.config.language, signal, session });
      const sttMs = Date.now() - sttStarted;
      const text = String(heard.text || "").trim();
      if (!text) {
        session.noteMetrics?.({ sttMs, llmFirstTokenMs: null, llmTotalMs: null, ttsMs: null, firstAudioMs: null });
        return;
      }
      session.noteTranscript?.("user", text);
      const llmStarted = Date.now();
      const generated = await this.reply({ session, history: session.history.slice(0, -1), user: text, signal });
      const llmTotalMs = Date.now() - llmStarted;
      session.noteTranscript?.("assistant", generated.text);
      const ttsStarted = Date.now();
      const spoken = session.config.tts === "local"
        ? await localSynthesize({
          text: generated.text,
          language: session.config.language,
          voice: session.config.voice,
          fetchImpl: this.fetchImpl,
          env: this.currentEnv(),
        })
        : await configuredSynthesize({
          text: generated.text,
          language: session.config.language,
          voice: session.config.voice,
          signal,
        });
      const ttsMs = Date.now() - ttsStarted;
      session.emit?.({ type: "audio", pcm: spoken.pcm, sampleRate: spoken.sampleRate });
      session.noteMetrics?.({
        sttMs,
        llmFirstTokenMs: generated.firstTokenMs ?? null,
        llmTotalMs,
        ttsMs: Math.max(0, ttsMs),
        firstAudioMs: Date.now() - started,
        llm: session.config.llm,
        model: generated.model,
        stt: heard.provider,
        tts: spoken.provider,
      });
    } catch (error) {
      if (error?.name === "AbortError") return;
      session.noteError?.(error instanceof ApiError ? error.message : publicError(error));
    } finally {
      this.busy = false;
      this.controller = null;
    }
  }

  interrupt() {
    this.controller?.abort();
    this.vad.reset();
  }

  async stop() {
    this.stopped = true;
    this.interrupt();
  }
}
