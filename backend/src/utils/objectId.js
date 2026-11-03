import mongoose from "mongoose";
import { ApiError } from "./errors.js";

export function assertObjectId(value) {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ApiError(400, "Identificator invalid.", "INVALID_ID");
  }
  const asString = String(value);
  if (new mongoose.Types.ObjectId(asString).toString() !== asString) {
    throw new ApiError(400, "Identificator invalid.", "INVALID_ID");
  }
  return asString;
}
