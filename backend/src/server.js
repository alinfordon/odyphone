import { createServer } from "node:http";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { getEnv } from "./config/env.js";
import { logger } from "./config/logger.js";
import { attachStatusSocket } from "./websocket/statusSocket.js";
import { attachVoiceLabSocket } from "./websocket/voiceLabSocket.js";
import { startAriEvents, ariRuntime } from "./telephony/ariEvents.js";
import { startAudioSocket } from "./audio/audioSocket.js";
import { assertProductionConfig } from "./services/productionReadiness.js";
import { startProductionMonitor } from "./services/productionMonitor.js";

const env = getEnv();
try {
  assertProductionConfig(env);
} catch (error) {
  logger.error({ blockers: error.blockers }, "Refuz pornirea în producție.");
  process.exit(1);
}
const app = createApp();

try {
  await connectDb();
} catch (error) {
  const reason = String(error?.message || "unknown error")
    .split("\n")[0]
    .replace(/mongodb(\+srv)?:\/\/\S+/gi, "mongodb://***");
  logger.error(
    { reason },
    "MongoDB connection failed. Check MONGODB_URI and that MongoDB is running.",
  );
  process.exit(1);
}

const server = createServer(app);
attachStatusSocket(server);
attachVoiceLabSocket(server);
const ariEvents = startAriEvents();
const audioSocket = startAudioSocket();
const monitor = startProductionMonitor();
server.listen(env.PORT, env.HOST, () => {
  logger.info(
    {
      port: env.PORT,
      developmentMode: env.developmentMode,
      telephony: ariRuntime.connected ? "ari-events" : "not connected",
    },
    "ODY Phone AI API listening",
  );
});

function shutdown() {
  monitor.stop();
  audioSocket.stop();
  ariEvents.stop();
  server.close(() => process.exit(0));
  server.closeAllConnections?.();
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
