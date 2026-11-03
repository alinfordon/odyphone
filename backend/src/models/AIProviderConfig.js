import mongoose from "mongoose";

const aiProviderConfigSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    slot: { type: String, enum: ["llm", "stt", "tts"], required: true },
    provider: { type: String, required: true },
    model: { type: String, default: "" },
    voiceId: { type: String, default: "" },
  },
  { timestamps: true },
);

aiProviderConfigSchema.index({ userId: 1, slot: 1 }, { unique: true });

aiProviderConfigSchema.methods.toPublic = function toPublic(configured) {
  return {
    id: String(this._id),
    slot: this.slot,
    provider: this.provider,
    model: this.model,
    voiceId: this.voiceId,
    configured: Boolean(configured),
    credentialsStoredInDatabase: false,
  };
};

export const AIProviderConfig = mongoose.model("AIProviderConfig", aiProviderConfigSchema);
