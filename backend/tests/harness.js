import mongoose from "mongoose";
import request from "supertest";

export async function createTestApp() {
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET ||= "test-access-secret-0123456789";
  process.env.JWT_REFRESH_SECRET ||= "test-refresh-secret-0123456789";
  process.env.FRONTEND_URL ||= "http://localhost:3000";
  process.env.BACKEND_URL ||= "http://127.0.0.1:4000";
  process.env.PHONE_AI_ENABLED ||= "false";
  process.env.PHONE_AI_DEVELOPMENT_MODE ||= "true";
  process.env.LOG_LEVEL ||= "silent";
  if (process.env.AUTH_RATE_LIMIT_DISABLED === undefined) {
    process.env.AUTH_RATE_LIMIT_DISABLED = "true";
  }

  const { MongoMemoryServer } = await import("mongodb-memory-server");
  const mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongod.getUri();
  const { resetEnvCache } = await import("../src/config/env.js");
  resetEnvCache();
  const { connectDb } = await import("../src/config/db.js");
  await connectDb();
  const { createApp } = await import("../src/app.js");
  return {
    app: createApp(),
    async stop() {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}

export async function registerOwner(app, extra = {}) {
  const email = extra.email || `alin.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;
  const password = extra.password || "correct-horse-battery";
  const response = await request(app).post("/api/v1/auth/register").send({
    email,
    password,
    name: extra.name || "Alin",
    client: extra.client || "mobile",
  });
  return {
    email,
    password,
    response,
    token: response.body?.data?.accessToken,
    refreshToken: response.body?.data?.refreshToken,
    user: response.body?.data?.user,
  };
}

export function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}
