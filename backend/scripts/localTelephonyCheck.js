import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createApp } from "../src/app.js";
import { startAudioSocket } from "../src/audio/audioSocket.js";
import { voiceRuntime } from "../src/audio/voiceRuntime.js";
import { createAriClient } from "../src/telephony/ariClient.js";
import { createAriEventConnection } from "../src/telephony/ariConnection.js";
import { ariRuntime } from "../src/telephony/ariEvents.js";
import { ariEventsUrl } from "../src/telephony/ariSafety.js";
import { getEnv } from "../src/config/env.js";

const env = getEnv();
const eventsUrl = ariEventsUrl(env.ASTERISK_ARI_URL, env.ASTERISK_APP_NAME);
const ari = createAriClient({
  baseUrl: env.ASTERISK_ARI_URL,
  username: env.ASTERISK_ARI_USERNAME,
  password: env.ASTERISK_ARI_PASSWORD,
  appName: env.ASTERISK_APP_NAME,
});
let opened = false;
let failure = "";
const connection = createAriEventConnection({
  WebSocketImpl: WebSocket,
  initialDelay: 1000,
  getTarget: () => ({ url: eventsUrl, authorization: ari.authHeader }),
  onEvent() {},
  onOpen() {
    opened = true;
    ariRuntime.configured = true;
    ariRuntime.connected = true;
  },
  onError(error) {
    failure = error?.message || "socket error";
  },
});
const audio = startAudioSocket({ force: true, host: "127.0.0.1", port: 9019 });
const deadline = Date.now() + 8000;
while ((!opened || !voiceRuntime.listening) && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 100));
}
const listeners = execFileSync("ss", ["-ltn"], { encoding: "utf8" })
  .split("\n")
  .filter((line) => line.includes(":9019") || line.includes(":8088"));
const server = createServer(createApp());
server.listen(0, "127.0.0.1");
await once(server, "listening");
const { port } = server.address();
const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
const health = await response.json();
const serialized = JSON.stringify(health);
const report = {
  eventsUrl,
  ariConnected: opened,
  ariFailure: opened ? "" : failure,
  audioListening: voiceRuntime.listening,
  audioHost: voiceRuntime.host,
  audioPort: voiceRuntime.port,
  listeners,
  healthStatus: response.status,
  health,
  leakedSecret: serialized.includes("password") || serialized.includes("Authorization"),
};
console.log(JSON.stringify(report, null, 2));
connection.stop();
ariRuntime.connected = false;
audio.stop();
server.close();
await new Promise((resolve) => setTimeout(resolve, 200));
const stillListening = execFileSync("ss", ["-ltn"], { encoding: "utf8" }).includes(":9019");
const audioBound = report.audioListening === true && report.audioHost === "127.0.0.1" && report.audioPort === 9019;
process.exit(opened && audioBound && !stillListening && response.status === 200 && !report.leakedSecret ? 0 : 1);
