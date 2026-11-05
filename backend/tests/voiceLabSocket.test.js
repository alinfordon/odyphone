import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { WebSocket } from "ws";
import { GeminiLiveProvider } from "../src/voiceLab/geminiLiveProvider.js";
import { createLabSession, resetVoiceLabStores } from "../src/voiceLab/sessions.js";
import { attachStatusSocket, issueWsTicket, takeTicket } from "../src/websocket/statusSocket.js";
import { attachVoiceLabSocket, createVoiceLabClient } from "../src/websocket/voiceLabSocket.js";
import { voiceLabCloseMessage, voiceLabWebSocketUrl } from "../../frontend/lib/voiceLabSocket.js";

function listen(setup) {
  const server = http.createServer();
  setup(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

function openSocket(url) {
  const ws = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error(`timeout ${url}`));
    }, 2000);
    ws.once("open", () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once("unexpected-response", (_request, response) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`http ${response.statusCode}`), { status: response.statusCode }));
    });
    ws.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

test("voice lab websocket url uses the page host", () => {
  assert.equal(
    voiceLabWebSocketUrl({ protocol: "http:", host: "192.168.0.231:3000" }),
    "ws://192.168.0.231:3000/ws/voice-lab",
  );
  assert.equal(
    voiceLabWebSocketUrl({ protocol: "https:", host: "192.168.0.231" }),
    "wss://192.168.0.231/ws/voice-lab",
  );
  assert.equal(voiceLabWebSocketUrl({ protocol: "http:", host: "192.168.0.231:3000" }).includes("localhost"), false);
});

test("browser close diagnostics keep the status code and hide a normal stop", () => {
  assert.match(voiceLabCloseMessage(1006, ""), /cod 1006/);
  assert.match(voiceLabCloseMessage(4001, "Authentication failed"), /4001/);
  assert.equal(voiceLabCloseMessage(1000, "page closed"), "");
});

test("websocket tickets expire and cannot be reused", async () => {
  const expired = issueWsTicket("user-1", 1);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(takeTicket(expired.ticket), null);
  const ticket = issueWsTicket("user-1");
  assert.equal(takeTicket(ticket.ticket), "user-1");
  assert.equal(takeTicket(ticket.ticket), null);
});

test("status and voice lab upgrades share one http server", async () => {
  const server = await listen((httpServer) => {
    attachStatusSocket(httpServer);
    attachVoiceLabSocket(httpServer);
  });
  const { port } = server.address();
  try {
    const status = await openSocket(`ws://127.0.0.1:${port}/ws`);
    const lab = await openSocket(`ws://127.0.0.1:${port}/ws/voice-lab`);
    status.close();
    lab.close();
    await assert.rejects(openSocket(`ws://127.0.0.1:${port}/ws/other`));
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test("voice lab rejects an invalid ticket without starting the engine", async () => {
  const server = await listen((httpServer) => attachVoiceLabSocket(httpServer));
  const { port } = server.address();
  try {
    const ws = await openSocket(`ws://127.0.0.1:${port}/ws/voice-lab`);
    const received = once(ws, "message");
    ws.send(JSON.stringify({ type: "auth", ticket: "not-a-ticket", sessionId: "missing" }));
    const [raw] = await received;
    const message = JSON.parse(String(raw));
    assert.equal(message.stage, "auth");
    assert.equal(message.code, "TICKET_REJECTED");
    assert.equal(JSON.stringify(message).includes("not-a-ticket"), false);
    const [code] = await once(ws, "close");
    assert.equal(code, 4001);
  } finally {
    server.closeAllConnections?.();
    server.close();
  }
});

test("engine start failure reaches the client without secrets", async () => {
  resetVoiceLabStores();
  const created = createLabSession({
    userId: "user-1",
    config: { engine: "gemini-live", language: "ro", voice: "Kore" },
  });
  const ticket = issueWsTicket("user-1");
  const sent = [];
  let closed = null;
  const client = createVoiceLabClient({
    send(payload) {
      sent.push(payload);
    },
    close(code, reason) {
      closed = { code, reason };
    },
    createEngine() {
      return {
        async start() {
          const error = new Error("denied AIzaSySECRETSECRET for https://example.invalid/live");
          error.code = "GEMINI_LIVE_ERROR";
          throw error;
        },
      };
    },
  });
  await client.handle({ type: "auth", ticket: ticket.ticket, sessionId: created.id });
  const error = sent.find((item) => item.type === "error");
  assert.equal(error.stage, "engine");
  assert.equal(error.code, "GEMINI_LIVE_ERROR");
  assert.equal(JSON.stringify(error).includes("AIza"), false);
  assert.equal(JSON.stringify(error).includes("https://"), false);
  assert.equal(closed.code, 4003);
});

test("gemini live connect errors stay redacted", async () => {
  const provider = new GeminiLiveProvider({
    env: { GEMINI_API_KEY: "present" },
    connect: async () => {
      const error = new Error("AIzaSySECRETSECRET https://generativelanguage.googleapis.com/secret");
      error.code = "403";
      throw error;
    },
  });
  await assert.rejects(
    () => provider.start({ config: { language: "ro", voice: "Kore" }, history: [] }),
    (error) => {
      assert.equal(String(error.message).includes("AIza"), false);
      assert.equal(String(error.message).includes("http"), false);
      assert.equal(error.code, "403");
      return true;
    },
  );
});
