import mongoose from "mongoose";

const callSessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    callId: { type: mongoose.Schema.Types.ObjectId, ref: "PhoneCall", required: true, index: true },
    state: { type: String, enum: ["created", "audio", "closed"], default: "created" },
    provider: { type: String, default: "none" },
    live: { type: Boolean, default: false },
    note: {
      type: String,
      default: "Înregistrările de sesiune nu sunt legate de o cale audio live în această versiune.",
    },
  },
  { timestamps: true },
);

export const CallSession = mongoose.model("CallSession", callSessionSchema);
