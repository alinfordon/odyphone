const CHANNEL_ID = /^[A-Za-z0-9._-]{1,80}$/;

export function assertChannelId(value) {
  const id = String(value || "");
  if (!CHANNEL_ID.test(id)) {
    const error = new Error("Identificator de canal invalid.");
    error.code = "INVALID_CHANNEL";
    throw error;
  }
  return id;
}

export function buildTrunkEndpoint(template, phoneNumber) {
  const pattern = String(template || "").trim();
  const digits = String(phoneNumber || "").replace(/\D/g, "");
  if (!pattern.includes("{number}") || !/^[\w@/:.{}-]+$/.test(pattern)) {
    const error = new Error("Șablonul de trunchi nu este utilizabil.");
    error.code = "TRUNK_NOT_CONFIGURED";
    throw error;
  }
  if (!/^\d{8,15}$/.test(digits)) {
    const error = new Error("Numărul pentru trunchi nu este valid.");
    error.code = "INVALID_PHONE";
    throw error;
  }
  return pattern.replaceAll("{number}", digits);
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export function isLoopbackAriUrl(httpBase) {
  try {
    const url = new URL(String(httpBase || ""));
    return (url.protocol === "http:" || url.protocol === "https:") && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function ariEventsUrl(httpBase, appName) {
  if (!isLoopbackAriUrl(httpBase)) {
    const error = new Error("ARI este permis doar pe localhost.");
    error.code = "ARI_NOT_LOOPBACK";
    throw error;
  }
  const url = new URL(httpBase);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}/events`;
  url.search = "";
  url.username = "";
  url.password = "";
  url.searchParams.set("app", appName);
  return url.toString();
}
