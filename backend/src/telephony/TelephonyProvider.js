export class TelephonyProvider {
  constructor(name) {
    this.name = name;
  }

  async health() {
    return {
      ok: false,
      state: "not_implemented",
      live: false,
      message: `${this.name} nu este conectat.`,
    };
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

  refused(action) {
    return {
      executed: false,
      live: false,
      action,
      reason: "Controlul canalelor este dezactivat. Preluarea unui apel real necesită o cale audio conectată, pe care această versiune nu o are.",
    };
  }
}
