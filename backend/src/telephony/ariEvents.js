import { WebSocket } from "ws";
import { User } from "../models/User.js";
import { getEnv } from "../config/env.js";
import { logger } from "../config/logger.js";
import { voiceCanAnswer } from "../audio/voiceRuntime.js";
import { createNotification } from "../services/notificationService.js";
import { getSettings } from "../services/settingsService.js";
import { createAriEventConnection } from "./ariConnection.js";
import { createAriClient } from "./ariClient.js";
import { ariEventsUrl } from "./ariSafety.js";
import { closeLiveSession, markLiveStasis, openLiveSession } from "./liveSessions.js";
import { createChannelBook, handleChannelDestroyed, handleInboundStasis, handleOutboundStasis } from "./callDispatcher.js";

export const ariRuntime = {
  configured: false,
  connected: false,
  detail: "ARI nu este configurat.",
};

export function classifyAriEvent(event) {
  if (event?.type === "StasisStart" && event.channel?.id) {
    if (event.args?.[0] === "dialed" && event.args?.[1]) return "outbound";
    return "inbound";
  }
  if ((event?.type === "ChannelDestroyed" || event?.type === "StasisEnd") && event.channel?.id) return "end";
  return "ignore";
}

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

  async function handleEvent(event) {
    const kind = classifyAriEvent(event);
    if (kind === "outbound") {
      markLiveStasis(event.args[1], "dialed");
      await handleOutboundStasis({ inboundId: event.args[1], outboundId: event.channel.id, ari, sessions });
      return;
    }
    if (kind === "inbound") {
      const opened = openLiveSession({
        channelId: event.channel.id,
        callerId: event.channel?.caller?.number || "",
      });
      if (opened.duplicate) {
        logger.info({ channelId: event.channel.id }, "duplicate stasis start");
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
    if (kind === "end") {
      if (sessions.has(event.channel.id)) {
        await handleChannelDestroyed({ channelId: event.channel.id, ari, sessions });
      }
      closeLiveSession(event.channel.id);
    }
  }

  const connection = createAriEventConnection({
    WebSocketImpl: WebSocket,
    getTarget() {
      if (stopped) {
        const error = new Error("stopped");
        throw error;
      }
      return {
        url: ariEventsUrl(getEnv().ASTERISK_ARI_URL, getEnv().ASTERISK_APP_NAME),
        authorization: ari.authHeader,
      };
    },
    onEvent(event) {
      return handleEvent(event).catch((error) => {
        logger.warn({ detail: error.message }, "asterisk event failed");
      });
    },
    onOpen() {
      wasConnected = true;
      disconnectNoted = false;
      ariRuntime.connected = true;
      ariRuntime.detail = voiceCanAnswer(getEnv())
        ? "Evenimentele ARI sunt conectate. AI poate prelua canalul prin AudioSocket."
        : "Evenimentele ARI sunt conectate. AI nu preia canalul până când vocea și AudioSocket sunt gata.";
      logger.info({ telephony: "ari-events", app: getEnv().ASTERISK_APP_NAME }, "Asterisk event stream connected");
    },
    onClose() {
      ariRuntime.connected = false;
      ariRuntime.detail = "Fluxul de evenimente ARI s-a întrerupt. Se reîncearcă conectarea.";
      if (!stopped) {
        noteDisconnect();
        logger.warn({ telephony: "ari-events" }, "Asterisk event stream disconnected");
      }
    },
    onError(error) {
      ariRuntime.connected = false;
      if (error?.code === "ARI_NOT_LOOPBACK") {
        ariRuntime.detail = "Adresa ARI nu este pe localhost.";
      }
      logger.warn({ detail: error?.message || "ari socket error", code: error?.code }, "asterisk connection error");
    },
  });

  return {
    stop() {
      stopped = true;
      connection.stop();
      ariRuntime.connected = false;
    },
  };
}
