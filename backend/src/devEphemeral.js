import { randomBytes } from "node:crypto";
import { MongoMemoryServer } from "mongodb-memory-server";

process.env.NODE_ENV ||= "development";
process.env.PHONE_AI_ENABLED ||= "false";
process.env.PHONE_AI_DEVELOPMENT_MODE ||= "true";
process.env.FRONTEND_URL ||= "http://localhost:3000";
process.env.BACKEND_URL ||= "http://localhost:4000";
if (!process.env.JWT_SECRET) process.env.JWT_SECRET = randomBytes(32).toString("hex");
if (!process.env.JWT_REFRESH_SECRET) process.env.JWT_REFRESH_SECRET = randomBytes(32).toString("hex");

const mongod = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongod.getUri();

console.log("ODY Phone AI is using an ephemeral MongoDB process.");
console.log("Records disappear when this process stops. Set MONGODB_URI for a durable database.");
console.log("Telephony is not connected. No live call will be answered.");

const shutdown = async () => {
  await mongod.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await import("./server.js");
