import { ApiError } from "../utils/errors.js";

export class LLMProvider {
  constructor(name) {
    this.name = name;
  }

  isConfigured() {
    return false;
  }

  async generate() {
    throw new ApiError(501, `${this.name} nu este configurat.`, "AI_NOT_CONFIGURED");
  }
}
