import { buildTrunkEndpoint } from "../telephony/ariSafety.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

function blocker(code) {
  return { code };
}

export function productionBlockers(env) {
  if (env?.NODE_ENV !== "production") return [];
  const blockers = [];
  if (env.developmentMode) blockers.push(blocker("DEVELOPMENT_MODE"));
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) blockers.push(blocker("JWT_SECRET_SHORT"));
  if (!env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET.length < 32) blockers.push(blocker("JWT_REFRESH_SHORT"));
  if (env.JWT_SECRET && env.JWT_SECRET === env.JWT_REFRESH_SECRET) blockers.push(blocker("JWT_SECRETS_MATCH"));
  if (!String(env.FRONTEND_URL || "").startsWith("https://")) blockers.push(blocker("FRONTEND_NOT_HTTPS"));
  if (!env.trustProxy) blockers.push(blocker("TRUST_PROXY_OFF"));
  if (env.allowRegistration) blockers.push(blocker("REGISTRATION_OPEN"));
  if (!LOOPBACK.has(String(env.AUDIOSOCKET_HOST || "").toLowerCase())) {
    blockers.push(blocker("AUDIOSOCKET_NOT_LOOPBACK"));
  }
  return blockers;
}

export function assertProductionConfig(env) {
  const blockers = productionBlockers(env);
  if (!blockers.length) return;
  const error = new Error("Production configuration refused");
  error.code = "PRODUCTION_REFUSED";
  error.blockers = blockers.map((item) => item.code);
  throw error;
}

export function describeSip({ env, ariConnected }) {
  const blockers = [];
  const ariConfigured = Boolean(env?.ASTERISK_ARI_URL && env?.ASTERISK_ARI_USERNAME && env?.ASTERISK_ARI_PASSWORD);
  let trunkValid = false;
  if (!env?.ASTERISK_TRUNK_ENDPOINT) {
    blockers.push({ code: "TRUNK_MISSING", message: "Lipsește șablonul de trunchi cu {number}." });
  } else {
    try {
      buildTrunkEndpoint(env.ASTERISK_TRUNK_ENDPOINT, "40722111000");
      trunkValid = true;
    } catch {
      blockers.push({ code: "TRUNK_INVALID", message: "Șablonul de trunchi nu este utilizabil." });
    }
  }
  if (!ariConfigured) blockers.push({ code: "ARI_MISSING", message: "Datele ARI lipsesc." });
  else if (!ariConnected) blockers.push({ code: "ARI_DOWN", message: "Fluxul de evenimente ARI nu este conectat." });
  if (env?.developmentMode) {
    blockers.push({ code: "DEVELOPMENT_MODE", message: "Modul de dezvoltare ține testul SIP închis." });
  }

  const configured = ariConfigured && trunkValid;
  let state = "not_configured";
  if (configured && blockers.length === 0) state = "ready";
  else if (configured) state = "blocked";

  let message = "Nu este conectat niciun trunchi SIP sau DID dedicat. Redirecționarea numărului personal nu este configurată.";
  if (state === "ready") {
    message = "Configurația permite un test SIP manual pe centrală. Acest panou nu plasează apelul.";
  } else if (state === "blocked") {
    message = blockers.map((item) => item.message).join(" ");
  } else if (env?.developmentMode) {
    message = `${message} Modul de dezvoltare ține testul SIP închis.`;
  }

  return {
    state,
    live: false,
    dialed: false,
    executed: false,
    allowed: state === "ready",
    message,
    blockers: blockers.map((item) => item.code),
  };
}
