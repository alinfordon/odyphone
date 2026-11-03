import mongoose from "mongoose";

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const fcmTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    role: { type: String, enum: ["owner"], default: "owner" },
    refreshTokens: { type: [refreshTokenSchema], default: [] },
    fcmTokens: { type: [fcmTokenSchema], default: [] },
  },
  { timestamps: true },
);

userSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    email: this.email,
    name: this.name,
    role: this.role,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export const User = mongoose.model("User", userSchema);
