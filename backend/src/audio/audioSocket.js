import { createServer } from "node:net";
import { getEnv } from "../config/env.js";
import { logger } from "../config/logger.js";
import { voiceRuntime } from "./voiceRuntime.js";

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
  const hex = payload.toString("hex");
  if (hex.length !== 32) return "";
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
  const server = createServer((socket) => {
    let pending = Buffer.alloc(0);
    let session = null;
    socket.on("data", (chunk) => {
      pending = Buffer.concat([pending, chunk]);
      const parsed = takeFrames(pending);
      pending = Buffer.from(parsed.rest);
      for (const frame of parsed.frames) {
        if (frame.type === 0x01) {
          const uuid = bytesToUuid(frame.payload);
          session = voiceRuntime.take(uuid);
          if (!session) {
            socket.end();
            return;
          }
          voiceRuntime.active += 1;
          session.bind(socket);
        } else if (frame.type === 0x10 && session) {
          session.onAudio(frame.payload).catch((error) => {
            logger.warn({ detail: error.message }, "voice audio frame failed");
          });
        } else if (frame.type === 0x00 && session) {
          session.onRemoteHangup().catch((error) => {
            logger.warn({ detail: error.message }, "voice hangup failed");
          });
        }
      }
    });
    socket.on("close", () => {
      if (!session) return;
      voiceRuntime.active = Math.max(0, voiceRuntime.active - 1);
      session.onRemoteHangup().catch(() => null);
      session = null;
    });
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
