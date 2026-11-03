import { randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";
import { logger } from "../config/logger.js";
import { getSettings } from "../services/settingsService.js";
import { getSystemStatus } from "../services/statusService.js";

const tickets = new Map();

export function issueWsTicket(userId) {
  const ticket = randomBytes(24).toString("base64url");
  tickets.set(ticket, { userId: String(userId), expiresAt: Date.now() + 30000 });
  return { ticket, expiresInSeconds: 30 };
}

function takeTicket(ticket) {
  const entry = tickets.get(ticket);
  tickets.delete(ticket);
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

export function attachStatusSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => {
    let userId = null;
    const authTimer = setTimeout(() => {
      if (!userId) socket.close(4001, "Authentication timed out");
    }, 5000);

    socket.on("message", async (raw) => {
      let message;
      try {
        message = JSON.parse(String(raw));
      } catch {
        socket.close(4002, "Invalid message");
        return;
      }
      if (!userId) {
        userId = takeTicket(message?.ticket);
        if (!userId || message?.type !== "auth") {
          socket.close(4001, "Authentication failed");
          return;
        }
        return;
      }
      if (message?.type === "status") {
        const settings = await getSettings(userId);
        const status = await getSystemStatus(settings);
        socket.send(JSON.stringify({ type: "status", data: status }));
      }
    });

    socket.on("close", () => clearTimeout(authTimer));
    socket.on("error", (error) => {
      logger.warn({ err: error }, "websocket connection error");
      clearTimeout(authTimer);
    });
  });
  return wss;
}
