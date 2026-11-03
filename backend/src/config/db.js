import mongoose from "mongoose";
import { getEnv } from "./env.js";

export async function connectDb() {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  const { MONGODB_URI } = getEnv();
  mongoose.set("strictQuery", true);
  await mongoose.connect(MONGODB_URI);
  return mongoose.connection;
}

export async function disconnectDb() {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
}
