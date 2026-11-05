import { randomUUID } from "node:crypto";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { getEnv } from "./config/env.js";
import { logger } from "./config/logger.js";
import { v1 } from "./api/v1/index.js";
import { mobile } from "./api/mobile.routes.js";
import { voiceRuntime } from "./audio/voiceRuntime.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { createApiLimiter } from "./middleware/rateLimit.js";
import { telephonyHealthState } from "./services/productionMonitor.js";
import { probeAsterisk } from "./services/statusService.js";
import { ariRuntime } from "./telephony/ariEvents.js";
import { activeSessionCount } from "./telephony/liveSessions.js";

export function createApp() {
  const env = getEnv();
  const app = express();
  if (env.trustProxy) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.setHeader("X-Request-Id", req.id);
    next();
  });
  app.use(pinoHttp({
    logger,
    genReqId: (req) => req.id,
    autoLogging: env.NODE_ENV !== "test",
  }));
  app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }));
  app.use(cors({
    origin(origin, callback) {
      if (!origin || origin === env.FRONTEND_URL) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());
  app.get("/api/v1/health", async (_req, res) => {
    let asterisk = { ok: false, state: "unreachable" };
    try {
      asterisk = await probeAsterisk();
    } catch {
      asterisk = { ok: false, state: "unreachable" };
    }
    res.json({
      data: {
        ok: true,
        service: "ody-phone-ai",
        api: "up",
        telephony: telephonyHealthState(),
        voice: voiceRuntime.listening ? "listening" : "down",
        ari: {
          configured: ariRuntime.configured,
          connected: ariRuntime.connected,
        },
        audioSocket: {
          listening: voiceRuntime.listening,
          host: voiceRuntime.listening ? voiceRuntime.host : null,
          port: voiceRuntime.listening ? voiceRuntime.port : null,
        },
        asterisk: {
          reachable: asterisk.state === "reachable",
          state: asterisk.state,
        },
        sessions: {
          active: activeSessionCount(),
          audioSockets: voiceRuntime.active,
        },
        developmentMode: env.developmentMode,
      },
    });
  });
  app.use("/api", createApiLimiter());
  app.use("/api/v1", v1);
  app.use("/api/mobile", mobile);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
