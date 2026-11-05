import { randomUUID } from "node:crypto";
import { ApiError } from "../utils/errors.js";
import { publicError } from "./errors.js";

const sessions = new Map();
const benchmarks = [];

function noteTranscript(role, text) {
  const clean = String(text || "").trim();
  if (!clean) return;
  const last = this.history[this.history.length - 1];
  if (last && last.role === role && last.text === clean) return;
  this.history.push({ role, text: clean });
  this.emit?.({ type: "transcript", role, text: clean });
}

function noteMetrics(metrics) {
  const row = {
    sttMs: metrics.sttMs ?? null,
    llmFirstTokenMs: metrics.llmFirstTokenMs ?? null,
    llmTotalMs: metrics.llmTotalMs ?? null,
    ttsMs: metrics.ttsMs ?? null,
    firstAudioMs: metrics.firstAudioMs ?? null,
    llm: metrics.llm || this.config.llm,
    model: metrics.model || this.config.ollamaModel || "",
    stt: metrics.stt || this.config.stt,
    tts: metrics.tts || this.config.tts,
  };
  this.metrics.push(row);
  this.emit?.({ type: "metrics", metrics: row });
}

function noteError(message, extra = {}) {
  const text = publicError(message);
  if (!text || this.errors.includes(text)) return;
  this.errors.push(text);
  const info = extra && typeof extra === "object" ? extra : {};
  this.emit?.({
    type: "error",
    message: text,
    stage: info.stage,
    code: info.code,
  });
}

function noteReconnect() {
  this.reconnects += 1;
  this.emit?.({ type: "reconnect", count: this.reconnects });
}

export function createLabSession({ userId, config }) {
  const session = {
    id: randomUUID(),
    userId: String(userId),
    config,
    history: [],
    metrics: [],
    errors: [],
    reconnects: 0,
    status: "created",
    connection: "closed",
    activeEngine: config.engine === "hybrid" ? "gemini-live" : config.engine,
    startedAt: new Date().toISOString(),
    endedAt: null,
    bound: false,
    noteTranscript,
    noteMetrics,
    noteError,
    noteReconnect,
  };
  sessions.set(session.id, session);
  return publicSession(session);
}

export function getLabSession(id, userId) {
  const session = sessions.get(String(id || ""));
  if (!session || session.userId !== String(userId)) return null;
  return session;
}

export function requireLabSession(id, userId) {
  const session = getLabSession(id, userId);
  if (!session) throw new ApiError(404, "Sesiunea de test nu există.", "VOICE_SESSION");
  return session;
}

export function listLabBenchmarks(userId) {
  return benchmarks.filter((item) => item.userId === String(userId)).slice(0, 20);
}

export function closeLabSession(id, userId) {
  const session = requireLabSession(id, userId);
  session.status = "closed";
  session.connection = "closed";
  session.endedAt = new Date().toISOString();
  const benchmark = publicBenchmark(session);
  benchmarks.unshift(benchmark);
  if (benchmarks.length > 100) benchmarks.length = 100;
  sessions.delete(session.id);
  return benchmark;
}

export function publicSession(session) {
  return {
    id: session.id,
    engine: session.config.engine,
    activeEngine: session.activeEngine,
    llm: session.config.llm,
    ollamaModel: session.config.ollamaModel || "",
    stt: session.config.stt,
    tts: session.config.tts,
    voice: session.config.voice || "",
    language: session.config.language,
    hybridFallback: session.config.hybridFallback !== false,
    status: session.status,
    connection: session.connection,
    startedAt: session.startedAt,
  };
}

export function publicBenchmark(session) {
  return {
    id: session.id,
    userId: session.userId,
    engine: session.config.engine,
    activeEngine: session.activeEngine,
    llm: session.config.llm,
    model: session.metrics.find((item) => item.model)?.model || session.config.ollamaModel || "",
    stt: session.config.stt,
    tts: session.config.tts,
    voice: session.config.voice || "",
    language: session.config.language,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    reconnects: session.reconnects,
    errors: session.errors.slice(),
    turns: session.metrics.map((item) => ({ ...item })),
    fallbackReason: session.fallbackReason || "",
  };
}

export function resetVoiceLabStores() {
  sessions.clear();
  benchmarks.length = 0;
}
