import { getEnv } from "../config/env.js";
import { probeAsterisk } from "../services/statusService.js";
import { TelephonyProvider } from "./TelephonyProvider.js";

export class AsteriskProvider extends TelephonyProvider {
  constructor() {
    super("asterisk");
  }

  configured() {
    const env = getEnv();
    return Boolean(env.ASTERISK_ARI_URL && env.ASTERISK_ARI_USERNAME && env.ASTERISK_ARI_PASSWORD);
  }

  async health() {
    return probeAsterisk();
  }

  async answer() {
    return this.refused("answer");
  }

  async reject() {
    return this.refused("reject");
  }

  async hangup() {
    return this.refused("hangup");
  }

  async transfer() {
    return this.refused("transfer");
  }
}

export const asteriskProvider = new AsteriskProvider();
