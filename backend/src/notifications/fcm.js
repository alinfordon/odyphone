import jwt from "jsonwebtoken";
import { getEnv } from "../config/env.js";
import { User } from "../models/User.js";

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
let cachedToken = { value: "", exp: 0 };

export function resetFcmCache() {
  cachedToken = { value: "", exp: 0 };
}

function serviceKey(value) {
  return String(value || "").replace(/\\n/g, "\n");
}

async function googleAccessToken(env, fetchImpl) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.value && cachedToken.exp - 60 > now) return cachedToken.value;
  const assertion = jwt.sign(
    {
      iss: env.FCM_CLIENT_EMAIL,
      scope: SCOPE,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    serviceKey(env.FCM_PRIVATE_KEY),
    { algorithm: "RS256" },
  );
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    throw new Error("auth");
  }
  const payload = await response.json();
  if (!payload.access_token) throw new Error("auth");
  cachedToken = { value: payload.access_token, exp: now + Number(payload.expires_in || 3600) };
  return payload.access_token;
}

export async function deliverPush({ userId, title, body, data = {}, fetchImpl = globalThis.fetch, loadTokens, removeToken }) {
  const env = getEnv();
  if (!env.FCM_PROJECT_ID || !env.FCM_CLIENT_EMAIL || !env.FCM_PRIVATE_KEY) {
    return {
      state: "not_configured",
      detail: "Datele de acces Firebase nu sunt configurate. Notificarea rămâne în centru.",
    };
  }
  const tokens = loadTokens
    ? await loadTokens(userId)
    : (await User.findById(userId).select("fcmTokens"))?.fcmTokens?.map((entry) => entry.token).filter(Boolean) || [];
  if (!tokens.length) {
    return {
      state: "no_device",
      detail: "Nu există un dispozitiv înregistrat. Notificarea rămâne în centru.",
    };
  }
  let access;
  try {
    access = await googleAccessToken(env, fetchImpl);
  } catch {
    return {
      state: "failed",
      detail: "Firebase a refuzat autentificarea. Notificarea rămâne în centru.",
    };
  }
  let sent = 0;
  let failed = 0;
  for (const device of tokens) {
    const response = await fetchImpl(
      `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FCM_PROJECT_ID)}/messages:send`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: device,
            notification: { title: String(title).slice(0, 120), body: String(body).slice(0, 180) },
            data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value ?? "")])),
          },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.ok) {
      sent += 1;
      continue;
    }
    failed += 1;
    const payload = await response.json().catch(() => ({}));
    const codes = JSON.stringify(payload?.error?.details || []);
    if (payload?.error?.status === "NOT_FOUND" || codes.includes("UNREGISTERED")) {
      if (removeToken) await removeToken(userId, device);
      else await User.updateOne({ _id: userId }, { $pull: { fcmTokens: { token: device } } });
    }
  }
  if (sent === 0) {
    return { state: "failed", detail: "Firebase nu a acceptat mesajul. Notificarea rămâne în centru." };
  }
  return {
    state: "sent",
    detail: failed ? `Trimis către ${sent} dispozitive. ${failed} au eșuat.` : `Trimis către ${sent} ${sent === 1 ? "dispozitiv" : "dispozitive"}.`,
  };
}
