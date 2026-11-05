import { createServer } from "node:net";
import { getEnv } from "../config/env.js";
import { logger } from "../config/logger.js";
import { voiceRuntime } from "./voiceRuntime.js";

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const AUDIO_SOCKET = {
  HANGUP: 0x00,
  UUID: 0x01,
  DTMF: 0x03,
  SLIN_8K: 0x10,
  ERROR: 0xff,
};

export function isLoopbackHost(host) {
  return LOOPBACK_HOSTS.has(String(host || "").toLowerCase());
}

export function encodeFrame(type, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const frame = Buffer.alloc(3 + body.length);
  frame[0] = type;
  frame.writeUInt16BE(body.length, 1);
  body.copy(frame, 3);
  return frame;
}

export function takeFrames(buffer) {
  const frames = [];
  let offset = 0;
  while (buffer.length - offset >= 3) {
    const type = buffer[offset];
    const length = buffer.readUInt16BE(offset + 1);
    if (buffer.length - offset < 3 + length) break;
    const start = offset + 3;
    frames.push({ type, payload: Buffer.from(buffer.subarray(start, start + length)) });
    offset = start + length;
  }
  return { frames, rest: buffer.subarray(offset) };
}

export function bytesToUuid(payload) {
  if (!Buffer.isBuffer(payload) || payload.length !== 16) return "";
  const hex = payload.toString("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID_TEXT.test(uuid) ? uuid : "";
}

export function applyAudioFrame({ type, payload, session, onUuid }) {
  if (type === AUDIO_SOCKET.HANGUP || type === AUDIO_SOCKET.ERROR) return "hangup";
  if (type === AUDIO_SOCKET.UUID) {
    if (session) return "ignore";
    const uuid = bytesToUuid(payload);
    if (!uuid) return "reject";
    return onUuid(uuid) ? "bound" : "reject";
  }
  if (!session) return "ignore";
  if (type === AUDIO_SOCKET.SLIN_8K) return "audio";
  if (type === AUDIO_SOCKET.DTMF) return "dtmf";
  if (type >= 0x11 && type <= 0x18) return "other-rate";
  return "ignore";
}

export function startAudioSocket({ force = false, port, host } = {}) {
  if (process.env.NODE_ENV === "test" && !force) return { stop() {} };
  if (voiceRuntime.server) return { stop: voiceRuntime.stop };
  let envHost = "127.0.0.1";
  let envPort = 9019;
  try {
    const env = getEnv();
    envHost = env.AUDIOSOCKET_HOST || envHost;
    envPort = env.AUDIOSOCKET_PORT || envPort;
  } catch {
    voiceRuntime.detail = "Adaptorul AudioSocket nu pornește: mediul nu este valid.";
    return { stop() {} };
  }
  const listenHost = host || envHost;
  const listenPort = port ?? envPort;
  if (!isLoopbackHost(listenHost)) {
    voiceRuntime.listening = false;
    voiceRuntime.detail = "AudioSocket refuză o adresă publică.";
    logger.warn({ host: listenHost }, "audiosocket refused public bind");
    return { stop() {} };
  }
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0);
    let session = null;
    let settled = false;
    function finish() {
      if (settled || !session) return;
      settled = true;
      voiceRuntime.active = Math.max(0, voiceRuntime.active - 1);
      const current = session;
      session = null;
      current.onRemoteHangup().catch((error) => {
        logger.warn({ detail: error.message }, "voice hangup failed");
      });
    }
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const parsed = takeFrames(pending);
      pending = Buffer.from(parsed.rest);
      for (const frame of parsed.frames) {
        const action = applyAudioFrame({
          type: frame.type,
          payload: frame.payload,
          session,
          onUuid(uuid) {
            const found = voiceRuntime.take(uuid);
            if (!found) return false;
            session = found;
            voiceRuntime.active += 1;
            session.bind(socket);
            return true;
          },
        });
        if (action === "reject") {
          socket.end();
          return;
        }
        if (action === "hangup") {
          finish();
          socket.end();
          return;
        }
        if (action === "audio") {
          session.onAudio(frame.payload).catch((error) => {
            logger.warn({ detail: error.message }, "voice audio frame failed");
          });
        } else if (action === "other-rate") {
          logger.warn({ type: frame.type }, "audiosocket frame is not 8 kHz slin");
        }
      }
    });
    socket.on("close", () => finish());
    socket.on("error", () => socket.destroy());
  });
  function stop() {
    voiceRuntime.listening = false;
    voiceRuntime.server = null;
    server.close();
  }
  voiceRuntime.stop = stop;
  server.on("error", (error) => {
    voiceRuntime.listening = false;
    voiceRuntime.detail = "AudioSocket nu a putut asculta. AI nu preia canalul.";
    logger.warn({ detail: error.message, port: listenPort }, "audiosocket listen failed");
  });
  server.listen(listenPort, listenHost, () => {
    const address = server.address();
    voiceRuntime.server = server;
    voiceRuntime.listening = true;
    voiceRuntime.host = listenHost;
    voiceRuntime.port = typeof address === "object" && address ? address.port : listenPort;
    voiceRuntime.detail = `AudioSocket ascultă pe ${voiceRuntime.host}:${voiceRuntime.port}.`;
    logger.info({ host: voiceRuntime.host, port: voiceRuntime.port }, "AudioSocket listening");
  });
  return {
    stop() {
      voiceRuntime.stop?.();
    },
  };
}
