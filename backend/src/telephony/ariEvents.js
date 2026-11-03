import { WebSocket } from "ws";
import { User } from "../models/User.js";
import { getEnv } from "../config/env.js";
import { logger } from "../config/logger.js";
import { voiceCanAnswer } from "../audio/voiceRuntime.js";
import { createNotification } from "../services/notificationService.js";
import { getSettings } from "../services/settingsService.js";
import { createAriClient } from "./ariClient.js";
import { ariEventsUrl } from "./ariSafety.js";
import { createChannelBook, handleChannelDestroyed, handleInboundStasis, handleOutboundStasis } from "./callDispatcher.js";

export const ariRuntime = {
  configured: false,
  connected: false,
  detail: "ARI nu este configurat.",
};

export function startAriEvents() {
  if (process.env.NODE_ENV === "test") return { stop() {} };
  let env;
  try {
    env = getEnv();
  } catch {
    return { stop() {} };
  }
  if (!env.ASTERISK_ARI_URL || !env.ASTERISK_ARI_USERNAME || !env.ASTERISK_ARI_PASSWORD) {
    ariRuntime.configured = false;
    ariRuntime.connected = false;
    ariRuntime.detail = "ARI nu este configurat.";
    return { stop() {} };
  }
  ariRuntime.configured = true;
  ariRuntime.detail = "ARI este configurat. Fluxul de evenimente nu este conectat.";
  const sessions = createChannelBook();
  const ari = createAriClient({
    baseUrl: env.ASTERISK_ARI_URL,
    username: env.ASTERISK_ARI_USERNAME,
    password: env.ASTERISK_ARI_PASSWORD,
    appName: env.ASTERISK_APP_NAME,
  });
  let stopped = false;
  let socket;
  let timer;
  let delay = 1000;
  let wasConnected = false;
  let disconnectNoted = false;

  function noteDisconnect() {
    if (!wasConnected || disconnectNoted) return;
    wasConnected = false;
    disconnectNoted = true;
    User.findOne().sort({ createdAt: 1 }).then((owner) => {
      if (!owner) return null;
      return createNotification(owner._id, {
        type: "telephony_disconnected",
        title: "Telefonie deconectată",
        body: "Fluxul de evenimente ARI s-a întrerupt. Se reîncearcă conectarea.",
      });
    }).catch((error) => {
      logger.warn({ detail: error.message }, "telephony disconnect notice failed");
    });
  }

  async function onEvent(event) {
    if (event?.type === "StasisStart" && event.channel?.id) {
      if (event.args?.[0] === "dialed" && event.args?.[1]) {
        await handleOutboundStasis({ inboundId: event.args[1], outboundId: event.channel.id, ari, sessions });
        return;
      }
      const owner = await User.findOne().sort({ createdAt: 1 });
      if (!owner) {
        await ari.hangup(event.channel.id, 16).catch(() => null);
        return;
      }
      const settings = await getSettings(owner._id);
      const result = await handleInboundStasis({
        channel: event.channel,
        userId: owner._id,
        ari,
        trunkTemplate: getEnv().ASTERISK_TRUNK_ENDPOINT || "",
        ownerNumber: settings.normalizedOwnerPhoneNumber || "",
        sessions,
      });
      if (result?.pending) {
        const inboundId = event.channel.id;
        setTimeout(() => {
          const session = sessions.get(inboundId);
          if (!session || session.bridged) return;
          handleChannelDestroyed({ channelId: inboundId, ari, sessions }).catch((error) => {
            logger.warn({ detail: error.message }, "asterisk dial timed out");
          });
        }, 45000);
      }
      return;
    }
    if ((event?.type === "ChannelDestroyed" || event?.type === "StasisEnd") && event.channel?.id && sessions.has(event.channel.id)) {
      await handleChannelDestroyed({ channelId: event.channel.id, ari, sessions });
    }
  }

  function connect() {
    if (stopped) return;
    let url;
    try {
      url = ariEventsUrl(getEnv().ASTERISK_ARI_URL, getEnv().ASTERISK_APP_NAME);
    } catch {
      ariRuntime.detail = "Adresa ARI nu este validă.";
      return;
    }
    socket = new WebSocket(url, { headers: { Authorization: ari.authHeader } });
    socket.on("open", () => {
      delay = 1000;
      wasConnected = true;
      disconnectNoted = false;
      ariRuntime.connected = true;
      ariRuntime.detail = voiceCanAnswer(getEnv())
        ? "Evenimentele ARI sunt conectate. AI poate prelua canalul prin AudioSocket."
        : "Evenimentele ARI sunt conectate. AI nu preia canalul până când vocea și AudioSocket sunt gata.";
      logger.info({ telephony: "ari-events" }, "Asterisk event stream connected");
    });
    socket.on("message", (raw) => {
      let event;
      try {
        event = JSON.parse(String(raw));
      } catch {
        return;
      }
      onEvent(event).catch((error) => {
        logger.warn({ detail: error.message }, "asterisk event failed");
      });
    });
    socket.on("close", () => {
      ariRuntime.connected = false;
      ariRuntime.detail = "Fluxul de evenimente ARI s-a întrerupt. Se reîncearcă conectarea.";
      if (!stopped) noteDisconnect();
      if (!stopped) {
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 30000);
      }
    });
    socket.on("error", () => {
      ariRuntime.connected = false;
      socket.close();
    });
  }

  connect();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
      ariRuntime.connected = false;
    },
  };
}
