import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import { createConversation } from "../src/ai/conversationEngine.js";
import { SpeechRecognitionProvider } from "../src/ai/SpeechRecognitionProvider.js";
import { bytesToUuid, encodeFrame, startAudioSocket } from "../src/audio/audioSocket.js";
import { downsample16, parseWav, wrapPcmAsWav } from "../src/audio/pcm.js";
import { createVad } from "../src/audio/vad.js";
import { createVoiceSession } from "../src/audio/voiceSession.js";
import { voiceRuntime } from "../src/audio/voiceRuntime.js";

test("phone audio wraps and resamples to 8 kHz", () => {
  const pcm = Buffer.alloc(4);
  pcm.writeInt16LE(1000, 0);
  pcm.writeInt16LE(3000, 2);
  const wav = wrapPcmAsWav(pcm, 16000);
  const parsed = parseWav(wav);
  assert.equal(parsed.sampleRate, 16000);
  const phone = downsample16(parsed.pcm, parsed.sampleRate, parsed.channels);
  assert.equal(phone.length, 2);
});

test("silence after speech yields one utterance", () => {
  const vad = createVad({ silenceMs: 40, minSpeechMs: 20, threshold: 200 });
  const loud = Buffer.alloc(320);
  const quiet = Buffer.alloc(320);
  loud.writeInt16LE(4000, 0);
  assert.equal(vad.push(quiet), null);
  assert.equal(vad.push(loud), null);
  assert.equal(vad.push(quiet), null);
  const utterance = vad.push(quiet);
  assert.ok(utterance);
  assert.equal(utterance.length, 960);
});

test("whisper transcription posts the wav and keeps the key out of the url", async () => {
  const previous = {
    provider: process.env.STT_PROVIDER,
    url: process.env.STT_API_URL,
    key: process.env.STT_API_KEY,
    model: process.env.STT_MODEL,
  };
  process.env.STT_PROVIDER = "whisper";
  process.env.STT_API_URL = "https://stt.example.test/v1/audio/transcriptions";
  process.env.STT_API_KEY = "stt-test-key";
  process.env.STT_MODEL = "whisper-1";
  const { resetEnvCache } = await import("../src/config/env.js");
  resetEnvCache();
  try {
    const provider = new SpeechRecognitionProvider(async (url, init) => {
      assert.equal(url.includes("stt-test-key"), false);
      assert.equal(init.headers.Authorization, "Bearer stt-test-key");
      assert.equal(init.body instanceof FormData, true);
      return new Response(JSON.stringify({ text: "bună ziua" }), { status: 200 });
    });
    const heard = await provider.transcribe({ wav: wrapPcmAsWav(Buffer.alloc(320)) });
    assert.equal(heard.text, "bună ziua");
  } finally {
    for (const [key, value] of Object.entries({
      STT_PROVIDER: previous.provider,
      STT_API_URL: previous.url,
      STT_API_KEY: previous.key,
      STT_MODEL: previous.model,
    })) {
      if (value == null) delete process.env[key];
      else process.env[key] = value;
    }
    resetEnvCache();
  }
});

test("a caller phrase produces one reply and an empty phrase does not call the model", async () => {
  let heard = 0;
  let generated = 0;
  const conversation = createConversation({
    instructions: "Ești ODY. Nu ești Alin.",
    stt: {
      async transcribe() {
        heard += 1;
        return { text: heard === 1 ? "" : "vreau un mesaj" };
      },
    },
    llm: { async generate() { generated += 1; return { text: "Am notat mesajul." }; } },
    tts: { async synthesize(text) { return { pcm: Buffer.from(text) }; } },
  });
  const first = await conversation.replyToWav(Buffer.alloc(44));
  assert.equal(generated, 0);
  assert.match(first.reply, /repeta/i);
  const second = await conversation.replyToWav(Buffer.alloc(44));
  assert.equal(generated, 1);
  assert.equal(second.reply, "Am notat mesajul.");
  assert.equal(second.text, "vreau un mesaj");
});

test("the greeting is paced onto the audio socket", async () => {
  const writes = [];
  const session = createVoiceSession({
    greetingPcm: Buffer.alloc(320, 1),
    silenceMs: 5000,
    responseTimeoutMs: 60000,
    maxCallDurationSeconds: 60,
    onUtterance: async () => null,
    onEnd: async () => {},
  });
  session.bind({ writable: true, write(frame) { writes.push(frame); }, end() {} });
  await new Promise((resolve) => setTimeout(resolve, 80));
  await session.end("remote");
  assert.equal(writes.some((frame) => frame[0] === 0x10), true);
});

test("an audiosocket client is matched by the uuid frame", async () => {
  const uuid = "00112233-4455-6677-8899-aabbccddeeff";
  let frames = 0;
  voiceRuntime.hold(uuid, {
    bind() {},
    async onAudio() { frames += 1; },
    async onRemoteHangup() {},
  });
  const started = startAudioSocket({ force: true, host: "127.0.0.1", port: 0 });
  for (let attempt = 0; attempt < 30 && !voiceRuntime.listening; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const socket = net.connect(voiceRuntime.port, "127.0.0.1");
  await new Promise((resolve) => socket.once("connect", resolve));
  socket.write(encodeFrame(0x01, Buffer.from(uuid.replace(/-/g, ""), "hex")));
  socket.write(encodeFrame(0x10, Buffer.alloc(320)));
  await new Promise((resolve) => setTimeout(resolve, 30));
  socket.end();
  started.stop();
  voiceRuntime.listening = false;
  assert.equal(bytesToUuid(Buffer.from(uuid.replace(/-/g, ""), "hex")), uuid);
  assert.equal(frames, 1);
});
