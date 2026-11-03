import { assertChannelId } from "./ariSafety.js";

export function createAriClient({ baseUrl, username, password, fetchImpl = fetch, appName = "ody-phone" }) {
  const root = String(baseUrl || "").replace(/\/$/, "");
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;

  async function request(path, { method = "GET", timeout = 5000 } = {}) {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: { Authorization: authorization, Accept: "application/json" },
      signal: AbortSignal.timeout(timeout),
    });
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { ok: response.ok, status: response.status, body };
  }

  return {
    authHeader: authorization,
    appName,
    async hangup(channelId, reasonCode = 16) {
      const id = assertChannelId(channelId);
      const code = Number(reasonCode) === 17 ? 17 : 16;
      const result = await request(`/channels/${encodeURIComponent(id)}?reason_code=${code}`, { method: "DELETE" });
      return { executed: result.ok || result.status === 404, live: false, status: result.status };
    },
    async ring(channelId) {
      const id = assertChannelId(channelId);
      const result = await request(`/channels/${encodeURIComponent(id)}/ring`, { method: "POST" });
      return { executed: result.ok, live: false };
    },
    async stopRing(channelId) {
      const id = assertChannelId(channelId);
      const result = await request(`/channels/${encodeURIComponent(id)}/ring`, { method: "DELETE" });
      return { executed: result.ok || result.status === 404, live: false };
    },
    async createBridge() {
      const result = await request("/bridges?type=mixing", { method: "POST" });
      return { executed: result.ok && Boolean(result.body?.id), id: result.body?.id || "", live: false };
    },
    async addToBridge(bridgeId, channelId) {
      const bridge = assertChannelId(bridgeId);
      const channel = assertChannelId(channelId);
      const result = await request(`/bridges/${encodeURIComponent(bridge)}/addChannel?channel=${encodeURIComponent(channel)}`, { method: "POST" });
      return { executed: result.ok, live: false };
    },
    async destroyBridge(bridgeId) {
      const bridge = assertChannelId(bridgeId);
      const result = await request(`/bridges/${encodeURIComponent(bridge)}`, { method: "DELETE" });
      return { executed: result.ok || result.status === 404, live: false };
    },
    async answer(channelId) {
      const id = assertChannelId(channelId);
      const result = await request(`/channels/${encodeURIComponent(id)}/answer`, { method: "POST" });
      return { executed: result.ok, live: result.ok, status: result.status };
    },
    async externalMedia({ externalHost, data, format = "slin" }) {
      const host = String(externalHost || "");
      if (!/^[\w.-]+:\d{1,5}$/.test(host) || !/^[0-9a-f-]{36}$/i.test(String(data || ""))) {
        return { executed: false, channelId: "", live: false };
      }
      const params = new URLSearchParams({
        app: appName,
        external_host: host,
        format,
        encapsulation: "audiosocket",
        transport: "tcp",
        connection_type: "client",
        direction: "both",
        data: String(data),
      });
      const result = await request(`/channels/externalMedia?${params.toString()}`, { method: "POST", timeout: 8000 });
      let channelId = "";
      try {
        channelId = assertChannelId(result.body?.id || "");
      } catch {
        channelId = "";
      }
      return { executed: result.ok && Boolean(channelId), channelId, live: false, status: result.status };
    },
    async originate({ endpoint, appArgs }) {
      const params = new URLSearchParams({
        endpoint,
        app: appName,
        appArgs,
      });
      const result = await request(`/channels?${params.toString()}`, { method: "POST" });
      return {
        executed: result.ok && Boolean(result.body?.id),
        channelId: result.body?.id || "",
        live: false,
        status: result.status,
      };
    },
  };
}
