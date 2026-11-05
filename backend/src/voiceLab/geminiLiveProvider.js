import { getEnv } from "../config/env.js";
import { logger } from "../config/logger.js";
import { buildOdyContext } from "../odyCore/index.js";
import { ApiError } from "../utils/errors.js";
import { publicError } from "./errors.js";

const LIVE_VOICES = ["Aoede", "Charon", "Fenrir", "Kore", "Puck"];

export function geminiLiveConfigured(env = getEnv()) {
  return Boolean(env.GEMINI_API_KEY);
}

export function liveSystemText(language, history, record = null) {
  return buildOdyContext({
    record,
    language,
    history,
    includeHistory: true,
    channel: "voice",
  }).text;
}

export async function defaultGeminiLiveConnect({ apiKey, model, system, voice, callbacks }) {
  let sdk;
  try {
    sdk = await import("@google/genai");
  } catch {
    const error = new Error("SDK-ul oficial @google/genai nu este instalat.");
    error.code = "GEMINI_SDK_MISSING";
    throw error;
  }
  const { GoogleGenAI, Modality } = sdk;
  const ai = new GoogleGenAI({ apiKey });
  const chosenVoice = LIVE_VOICES.includes(voice) ? voice : "Kore";
  return ai.live.connect({
    model,
    config: {
      responseModalities: [Modality?.AUDIO || "AUDIO"],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: chosenVoice } } },
      systemInstruction: { parts: [{ text: system }] },
    },
    callbacks,
  });
}

function liveText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return String(value.text || "");
}

export function readLiveMessage(message) {
  const content = message?.serverContent || message?.server_content || {};
  const parts = content.modelTurn?.parts || content.model_turn?.parts || [];
  const audio = [];
  for (const part of parts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) audio.push(String(inline.data));
  }
  return {
    input: liveText(content.inputTranscription || content.input_transcription).trim(),
    output: liveText(content.outputTranscription || content.output_transcription).trim(),
    audio,
    interrupted: Boolean(content.interrupted),
  };
}

export class GeminiLiveProvider {
  constructor({ connect = defaultGeminiLiveConnect, env = null } = {}) {
    this.name = "gemini-live";
    this.connect = connect;
    this.env = env;
    this.handle = null;
    this.stopped = false;
    this.opening = false;
    this.reconnects = 0;
    this.turnStartedAt = 0;
    this.heardAudio = false;
  }

  configured() {
    return geminiLiveConfigured(this.env || getEnv());
  }

  async start(session) {
    if (!this.configured()) {
      throw new ApiError(501, "Gemini Live nu este configurat. Lipsește cheia API.", "GEMINI_LIVE_NOT_CONFIGURED");
    }
    this.stopped = false;
    this.reconnects = 0;
    await this.open(session);
  }

  async open(session) {
    if (this.stopped || this.opening) return;
    this.opening = true;
    const env = this.env || getEnv();
    session.connection = "connecting";
    session.emit?.({ type: "state", connection: "connecting", engine: this.name });
    try {
      this.handle = await this.connect({
        apiKey: env.GEMINI_API_KEY,
        model: env.GEMINI_LIVE_MODEL || "gemini-3.8-live",
        system: liveSystemText(session.config.language, session.history, session.odyContext),
        voice: session.config.voice,
        callbacks: {
          onopen: () => {
            session.connection = "open";
            logger.info({ stage: "gemini-open", model: env.GEMINI_LIVE_MODEL || "gemini-3.8-live" }, "gemini live connected");
            session.emit?.({ type: "state", connection: "open", engine: this.name });
          },
          onmessage: (message) => this.onMessage(session, message),
          onerror: (error) => {
            logger.warn({ stage: "gemini-error", code: liveErrorCode(error), detail: publicError(error) }, "gemini live error");
            this.fail(session, error);
          },
          onclose: (event) => {
            const code = event?.code ?? "GEMINI_LIVE_CLOSED";
            const detail = publicError(event?.reason || "");
            logger.warn({ stage: "gemini-close", code, detail }, "gemini live closed");
            if (this.stopped) return;
            if (isFatalLiveClose(code)) {
              const error = new Error(detail || "Conexiunea Gemini Live s-a întrerupt.");
              error.code = String(code);
              this.fail(session, error);
              return;
            }
            this.scheduleReconnect(session);
          },
        },
      });
    } catch (error) {
      this.opening = false;
      logger.warn({ stage: "gemini-connect", code: liveErrorCode(error), detail: publicError(error) }, "gemini live connect failed");
      throw new ApiError(502, publicError(error), error?.code || "GEMINI_LIVE_ERROR");
    }
    this.opening = false;
  }

  onMessage(session, message) {
    const live = readLiveMessage(message);
    if (live.interrupted) {
      this.turnStartedAt = 0;
      this.heardAudio = false;
      session.emit?.({ type: "interrupt" });
    }
    if (live.input) {
      this.turnStartedAt = Date.now();
      this.heardAudio = false;
      session.noteTranscript?.("user", live.input);
    }
    if (live.output) session.noteTranscript?.("assistant", live.output);
    for (const chunk of live.audio) {
      if (!this.heardAudio && this.turnStartedAt) {
        this.heardAudio = true;
        session.noteMetrics?.({
          sttMs: null,
          llmFirstTokenMs: null,
          llmTotalMs: null,
          ttsMs: null,
          firstAudioMs: Date.now() - this.turnStartedAt,
        });
      }
      session.emit?.({ type: "audio", pcm: chunk, sampleRate: 24000 });
    }
  }

  scheduleReconnect(session) {
    if (this.stopped || this.reconnects >= 3) {
      this.fail(session, new Error("Conexiunea Gemini Live s-a întrerupt."));
      return;
    }
    this.reconnects += 1;
    session.noteReconnect?.();
    const delay = this.reconnects * 1000;
    this.timer = setTimeout(() => {
      this.handle = null;
      this.open(session).catch((error) => this.fail(session, error));
    }, delay);
  }

  async fail(session, error) {
    if (this.stopped || this.failed) return;
    this.failed = true;
    clearTimeout(this.timer);
    const message = publicError(error);
    const code = liveErrorCode(error);
    logger.warn({ stage: "gemini-fail", code, detail: message }, "gemini live failed");
    if (session.allowFallback && session.onEngineFailure) {
      await session.onEngineFailure(message);
      return;
    }
    session.noteError?.(message, { stage: "gemini-live", code });
  }

  sendAudio(_session, pcm, sampleRate = 16000) {
    if (!this.handle || this.stopped) return;
    const body = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm);
    this.handle.sendRealtimeInput?.({
      audio: { data: body.toString("base64"), mimeType: `audio/pcm;rate=${sampleRate}` },
    });
  }

  async interrupt() {
    await this.handle?.sendClientContent?.({ turnComplete: true });
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    try {
      this.handle?.close?.();
    } catch {
      // The socket is already gone.
    }
    this.handle = null;
  }
}

function isFatalLiveClose(code) {
  const numeric = Number(code);
  return numeric === 1008 || numeric === 1007 || numeric === 1003;
}

function liveErrorCode(error) {
  const code = error?.code || error?.status;
  if (typeof code === "string" || typeof code === "number") return String(code).slice(0, 40);
  return "GEMINI_LIVE_ERROR";
}

export { LIVE_VOICES };
