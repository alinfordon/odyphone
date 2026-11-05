import { WebSocketServer } from "ws";
import { logger } from "../config/logger.js";
import { takeTicket } from "./statusSocket.js";
import { registerWebSocketRoute } from "./upgradeRouter.js";
import { loadOdyRecord } from "../odyCore/index.js";
import { createVoiceEngine } from "../voiceLab/engines.js";
import { publicError } from "../voiceLab/errors.js";
import { closeLabSession, getLabSession, publicSession } from "../voiceLab/sessions.js";

const MAX_PCM = 64 * 1024;

export function attachVoiceLabSocket(server) {
  const wss = new WebSocketServer({ noServer: true, path: "/ws/voice-lab" });
  registerWebSocketRoute(server, "/ws/voice-lab", wss);
  wss.on("connection", (socket) => {
    const client = createVoiceLabClient({
      send(payload) {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
      },
      close(code, reason) {
        socket.close(code, reason);
      },
    });
    const authTimer = setTimeout(() => client.closeUnauthenticated(), 5000);
    socket.on("message", (raw, isBinary) => {
      if (isBinary) return;
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        socket.close(4002, "Invalid message");
        return;
      }
      client.handle(message).then(() => {
        if (client.authed) clearTimeout(authTimer);
      }).catch((error) => {
        logger.warn({ stage: "socket", code: error?.code || "VOICE_LAB_SOCKET", detail: publicError(error) }, "voice lab socket failed");
      });
    });
    socket.on("close", (code, reason) => {
      clearTimeout(authTimer);
      logger.info({
        stage: "close",
        code,
        detail: String(reason || "").slice(0, 120),
      }, "voice lab websocket closed");
      client.close().catch(() => null);
    });
    socket.on("error", (error) => {
      logger.warn({ stage: "socket", code: error?.code || "WS_ERROR", detail: publicError(error) }, "voice lab socket error");
    });
  });
  return wss;
}

function authRejection({ userId, type, session }) {
  if (type !== "auth") {
    return { code: "AUTH_TYPE", message: "Primul mesaj trebuie să fie autentificarea sesiunii." };
  }
  if (!userId) {
    return { code: "TICKET_REJECTED", message: "Tichetul WebSocket este invalid, expirat sau a fost deja folosit." };
  }
  if (!session) {
    return { code: "SESSION_NOT_FOUND", message: "Sesiunea de test nu există pentru acest utilizator." };
  }
  if (session.bound) {
    return { code: "SESSION_ALREADY_BOUND", message: "Sesiunea de test este deja conectată." };
  }
  return null;
}

export function createVoiceLabClient({ send, close, createEngine = createVoiceEngine }) {
  let session = null;
  let engine = null;
  let authed = false;
  let closed = false;
  let messages = 0;
  let windowStarted = Date.now();

  async function handle(message) {
    if (!authed) {
      const userId = takeTicket(message?.ticket);
      session = userId ? getLabSession(message?.sessionId, userId) : null;
      const rejection = authRejection({ userId, type: message?.type, session });
      if (rejection) {
        logger.warn({ stage: "auth", code: rejection.code }, "voice lab authentication rejected");
        send({ type: "error", stage: "auth", code: rejection.code, message: rejection.message });
        close(4001, "Authentication failed");
        return;
      }
      authed = true;
      session.bound = true;
      session.status = "live";
      session.emit = send;
      session.odyContext = await loadOdyRecord(userId);
      logger.info({ stage: "auth", sessionId: session.id, engine: session.config.engine }, "voice lab authenticated");
      engine = createEngine(session.config.engine);
      session.engine = engine;
      try {
        logger.info({ stage: "engine", engine: session.config.engine }, "voice lab engine starting");
        await engine.start(session);
      } catch (error) {
        const detail = publicError(error);
        const code = error?.code || "ENGINE_START";
        logger.warn({ stage: "engine", code, detail }, "voice lab engine failed");
        session.noteError(detail, { stage: "engine", code });
        close(4003, "Engine failed");
        return;
      }
      send({ type: "ready", session: publicSession(session) });
      return;
    }
    const now = Date.now();
    if (now - windowStarted > 1000) {
      windowStarted = now;
      messages = 0;
    }
    messages += 1;
    if (messages > 40) return;
    if (message?.type === "audio") {
      const pcm = Buffer.from(String(message.pcm || ""), "base64");
      if (!pcm.length || pcm.length > MAX_PCM) return;
      engine?.sendAudio(session, pcm, Number(message.sampleRate) || 16000);
      return;
    }
    if (message?.type === "utterance-end") {
      await engine?.endUtterance?.(session);
      return;
    }
    if (message?.type === "interrupt") {
      await engine?.interrupt?.(session);
      send({ type: "interrupt" });
      return;
    }
    if (message?.type === "stop") await shutdown();
  }

  async function shutdown() {
    if (closed) return;
    closed = true;
    try {
      await engine?.stop?.(session);
    } catch {
      // Stopping a failed engine is still success for the lab.
    }
    if (session && session.status !== "closed") {
      const benchmark = closeLabSession(session.id, session.userId);
      send({ type: "closed", benchmark: { ...benchmark, userId: undefined } });
    }
  }

  return {
    get authed() {
      return authed;
    },
    handle,
    close: shutdown,
    closeUnauthenticated() {
      if (authed) return;
      logger.warn({ stage: "auth", code: "AUTH_TIMEOUT" }, "voice lab authentication timed out");
      send({ type: "error", stage: "auth", code: "AUTH_TIMEOUT", message: "Autentificarea WebSocket a expirat." });
      close(4001, "Authentication timed out");
    },
  };
}
