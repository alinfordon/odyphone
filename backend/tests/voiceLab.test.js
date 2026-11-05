import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import pino from "pino";
import { voiceLabSessionSchema } from "../src/api/schemas.js";
import { logRedact } from "../src/config/logger.js";
import { ApiError } from "../src/utils/errors.js";
import { createVoiceEngine } from "../src/voiceLab/engines.js";
import { publicError } from "../src/voiceLab/errors.js";
import { GeminiLiveProvider } from "../src/voiceLab/geminiLiveProvider.js";
import { HybridVoiceProvider } from "../src/voiceLab/hybridVoiceProvider.js";
import { classifyOllamaModel, generateOllama, listOllamaModels, splitOllamaModels } from "../src/voiceLab/ollamaProvider.js";
import { closeLabSession, createLabSession, listLabBenchmarks, resetVoiceLabStores } from "../src/voiceLab/sessions.js";
import { runTextTest } from "../src/voiceLab/textTest.js";
import { createVoiceLabClient } from "../src/websocket/voiceLabSocket.js";
import { issueWsTicket } from "../src/websocket/statusSocket.js";

const ollamaEnv = {
  OLLAMA_BASE_URL: "http://192.168.0.216:11434",
  OLLAMA_MODEL: "gemma4:e2b",
  OLLAMA_TIMEOUT_MS: 1000,
};

test("ollama tags split local models from cloud models", () => {
  const split = splitOllamaModels([
    { name: "gemma4:e2b", size: 10, details: { family: "gemma", parameter_size: "2B" } },
    { name: "llama3.2:3b", size: 20 },
    { name: "gemma4:cloud", remote_host: "https://ollama.com", remote_model: "gemma4:31b", size: 0 },
    { model: "qwen:cloud", size: 0 },
  ]);
  assert.deepEqual(split.local.map((item) => item.name), ["gemma4:e2b", "llama3.2:3b"]);
  assert.deepEqual(split.cloud.map((item) => item.name), ["gemma4:cloud", "qwen:cloud"]);
  assert.equal(split.local.every((item) => item.local && !item.cloud), true);
  assert.equal(classifyOllamaModel({ name: "aya:8b", size: 5 }).local, true);
});

test("ollama discovery reads /api/tags and does not return the server address", async () => {
  let requested = "";
  const result = await listOllamaModels({
    env: ollamaEnv,
    fetchImpl: async (url) => {
      requested = url;
      return {
        ok: true,
        async json() {
          return { models: [{ name: "gemma4:e2b", size: 4 }, { name: "gpt-oss:cloud", remote_host: "https://ollama.com" }] };
        },
      };
    },
  });
  assert.equal(result.reachable, true);
  assert.equal(result.local[0].name, "gemma4:e2b");
  assert.equal(result.cloud[0].cloud, true);
  assert.equal(result.selected, "gemma4:e2b");
  assert.equal(JSON.stringify(result).includes("192.168.0.216"), false);
  assert.match(requested, /\/api\/tags$/);
});

test("voice engines are selected by name", () => {
  assert.equal(createVoiceEngine("gemini-live", { env: { GEMINI_API_KEY: "" } }).name, "gemini-live");
  assert.equal(createVoiceEngine("modular", { env: ollamaEnv }).name, "modular");
  assert.equal(createVoiceEngine("hybrid", {
    live: { name: "gemini-live" },
    modular: { name: "modular" },
  }).name, "hybrid");
  assert.throws(() => createVoiceEngine("phone"), /nu este recunoscut/);
});

test("gemini live hides the api key when the socket fails", async () => {
  const provider = new GeminiLiveProvider({
    env: { GEMINI_API_KEY: "AIzaSECRETKEY1234567890", GEMINI_LIVE_MODEL: "gemini-3.8-live" },
    connect: async () => {
      throw new Error("upstream rejected AIzaSECRETKEY1234567890");
    },
  });
  const session = { config: { language: "ro", voice: "Kore" }, history: [], emit() {} };
  await assert.rejects(() => provider.start(session), (error) => {
    assert.equal(error instanceof ApiError, true);
    assert.equal(String(error.message).includes("AIzaSECRETKEY1234567890"), false);
    return true;
  });
});

test("ollama generation times out without exposing the base url", async () => {
  await assert.rejects(() => generateOllama({
    model: "gemma4:e2b",
    user: "Salut",
    env: { ...ollamaEnv, OLLAMA_TIMEOUT_MS: 20 },
    timeoutMs: 20,
    fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      });
    }),
  }), (error) => {
    assert.equal(error.code, "OLLAMA_TIMEOUT");
    assert.equal(error.message.includes("192.168.0.216"), false);
    return true;
  });
});

test("hybrid falls back once and keeps the conversation", async () => {
  const session = {
    config: { engine: "hybrid", hybridFallback: true, language: "ro", llm: "gemini", stt: "configured", tts: "configured" },
    history: [{ role: "user", text: "Bună" }],
    events: [],
    emit(event) { this.events.push(event); },
  };
  const live = {
    async start() { throw new Error("live indisponibil"); },
    async stop() { this.stopped = true; },
  };
  const modular = {
    async start(current) {
      current.connection = "open";
      this.started = true;
    },
    async stop() {},
  };
  const engine = new HybridVoiceProvider({ live, modular });
  await engine.start(session);
  assert.equal(session.activeEngine, "modular");
  assert.equal(session.history[0].text, "Bună");
  assert.equal(live.stopped, true);
  assert.equal(modular.started, true);
  assert.equal(session.events.at(-1).engine, "modular");
});

test("a lab session records benchmarks without audio or secrets", () => {
  resetVoiceLabStores();
  const created = createLabSession({
    userId: "owner-1",
    config: {
      engine: "modular",
      llm: "ollama",
      ollamaModel: "gemma4:e2b",
      stt: "configured",
      tts: "configured",
      voice: "alloy",
      language: "ro",
      hybridFallback: true,
    },
  });
  const session = closeLabSession(created.id, "owner-1");
  const stored = listLabBenchmarks("owner-1")[0];
  stored.errors = [];
  const raw = JSON.stringify(stored);
  assert.equal(stored.engine, "modular");
  assert.equal(stored.llm, "ollama");
  assert.equal(stored.model, "gemma4:e2b");
  assert.equal(raw.includes("pcm"), false);
  assert.equal(raw.includes("AIza"), false);
  assert.equal(raw.includes("password"), false);
  assert.equal(closeLabSession.length, 2);
  void session;
});

test("voice lab config rejects an unknown engine", () => {
  const parsed = voiceLabSessionSchema.safeParse({ body: { engine: "phone", llm: "gemini" }, query: {}, params: {} });
  assert.equal(parsed.success, false);
  const accepted = voiceLabSessionSchema.safeParse({
    body: { engine: "hybrid", llm: "ollama", ollamaModel: "qwen2.5:7b", language: "ro" },
    query: {},
    params: {},
  });
  assert.equal(accepted.success, true);
  assert.equal(accepted.data.body.hybridFallback, true);
  assert.equal(accepted.data.body.stt, "configured");
});

test("logs redact api keys", () => {
  let line = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      line += chunk.toString();
      callback();
    },
  });
  const log = pino({ redact: logRedact }, stream);
  log.info({
    apiKey: "super-secret-key",
    GEMINI_API_KEY: "AIzaSECRETKEY1234567890",
    headers: { authorization: "Bearer hidden-token" },
  }, "voice lab");
  assert.equal(line.includes("super-secret-key"), false);
  assert.equal(line.includes("AIzaSECRETKEY1234567890"), false);
  assert.equal(line.includes("hidden-token"), false);
  assert.equal(publicError("failed AIzaSECRETKEY1234567890 at http://192.168.0.216:11434/api/chat").includes("AIzaSECRETKEY1234567890"), false);
});

test("a voice lab socket accepts one session and then stops it", async () => {
  resetVoiceLabStores();
  const created = createLabSession({
    userId: "owner-2",
    config: {
      engine: "gemini-live",
      llm: "gemini",
      ollamaModel: "",
      stt: "configured",
      tts: "configured",
      voice: "Kore",
      language: "ro",
      hybridFallback: false,
    },
  });
  const seen = [];
  const engine = {
    started: false,
    audioBytes: 0,
    stopped: false,
    async start(session) {
      this.started = true;
      session.connection = "open";
      session.emit({ type: "state", connection: "open", engine: "gemini-live" });
    },
    sendAudio(_session, pcm) {
      this.audioBytes += pcm.length;
    },
    async stop() {
      this.stopped = true;
    },
  };
  const client = createVoiceLabClient({
    send(payload) { seen.push(payload); },
    close() {},
    createEngine() { return engine; },
  });
  const { ticket } = issueWsTicket("owner-2");
  await client.handle({ type: "auth", ticket, sessionId: created.id });
  await client.handle({ type: "audio", pcm: Buffer.alloc(320).toString("base64"), sampleRate: 16000 });
  await client.handle({ type: "stop" });
  assert.equal(engine.started, true);
  assert.equal(engine.audioBytes, 320);
  assert.equal(engine.stopped, true);
  assert.equal(seen.some((item) => item.type === "ready"), true);
  assert.equal(seen.some((item) => item.type === "closed"), true);
  const benchmark = listLabBenchmarks("owner-2")[0];
  assert.equal(benchmark.activeEngine, "gemini-live");
  assert.equal(JSON.stringify(benchmark).includes("AIza"), false);
});

test("text test refuses an ollama model that was not discovered", async () => {
  await assert.rejects(() => runTextTest({
    llm: "ollama",
    model: "missing:latest",
    prompt: "Spune bună",
    env: ollamaEnv,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { models: [{ name: "gemma4:e2b", size: 1 }] };
      },
    }),
  }), (error) => error.code === "OLLAMA_MODEL");
});
