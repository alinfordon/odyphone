import { randomUUID } from "node:crypto";
import { composeAssistantInstructions } from "../../../shared/constants/index.js";
import { geminiProvider } from "../ai/GeminiProvider.js";
import { createConversation } from "../ai/conversationEngine.js";
import { speechRecognitionProvider } from "../ai/SpeechRecognitionProvider.js";
import { textToSpeechProvider } from "../ai/TextToSpeechProvider.js";
import { getEnv } from "../config/env.js";
import { CallSession } from "../models/CallSession.js";
import { PhoneCall } from "../models/PhoneCall.js";
import { PhoneContact } from "../models/PhoneContact.js";
import { applyCallEvent, summarizeCall } from "../services/callService.js";
import { createNotification } from "../services/notificationService.js";
import { getSettings } from "../services/settingsService.js";
import { wrapPcmAsWav } from "./pcm.js";
import { voiceRuntime } from "./voiceRuntime.js";
import { createVoiceSession } from "./voiceSession.js";

const FAILURE = "Nu reușesc să continui conversația. Puteți repeta, vă rog?";
const STILL_THERE = "Mai sunteți acolo?";

export async function connectAiVoice({ ari, channelId, userId, call, sessions, deps = {} }) {
  const env = getEnv();
  const runtime = deps.runtime || voiceRuntime;
  const stt = deps.stt || speechRecognitionProvider;
  const tts = deps.tts || textToSpeechProvider;
  const llm = deps.llm || geminiProvider;
  const settings = await getSettings(userId);
  const contact = call.contactId
    ? await PhoneContact.findOne({ _id: call.contactId, userId })
    : null;
  const conversation = createConversation({
    llm,
    stt,
    tts,
    instructions: composeAssistantInstructions({ settings, contact }),
    responseTimeoutMs: settings.responseTimeoutMs,
  });
  let greeting;
  try {
    greeting = await conversation.greeting(contact?.greeting?.trim() || settings.greeting);
  } catch (error) {
    return { answered: false, live: false, reason: "greeting", detail: error.message };
  }
  const uuid = randomUUID();
  const externalHost = `${runtime.host || env.AUDIOSOCKET_HOST || "127.0.0.1"}:${runtime.port || env.AUDIOSOCKET_PORT || 9019}`;
  const media = await ari.externalMedia({ externalHost, data: uuid });
  if (!media.executed) {
    return { answered: false, live: false, reason: "external_media" };
  }
  const channelAnswer = await ari.answer(channelId);
  if (!channelAnswer.executed) {
    await ari.hangup(media.channelId, 16).catch(() => null);
    return { answered: false, live: false, reason: "answer" };
  }
  const bridge = await ari.createBridge();
  const inboundAdded = bridge.executed ? await ari.addToBridge(bridge.id, channelId) : { executed: false };
  const mediaAdded = inboundAdded.executed ? await ari.addToBridge(bridge.id, media.channelId) : { executed: false };
  if (!mediaAdded.executed) {
    if (bridge.id) await ari.destroyBridge(bridge.id).catch(() => null);
    await ari.hangup(channelId, 16).catch(() => null);
    await ari.hangup(media.channelId, 16).catch(() => null);
    const failed = await applyCallEvent({ userId, callId: call._id, event: "fail" });
    failed.execution = "channel_closed";
    failed.transcript.push({
      role: "system",
      text: "Canalul a fost preluat, dar adaptorul audio nu a putut fi legat. Conversația nu a început.",
      at: new Date(),
    });
    await failed.save();
    return { answered: false, failed: true, live: false, call: failed };
  }
  const answered = await applyCallEvent({ userId, callId: call._id, event: "answer" });
  const live = await applyCallEvent({ userId, callId: answered._id, event: "progress" });
  live.execution = "voice_session";
  live.transcript.push({
    role: "system",
    text: "Apelantul este pe calea vocală. Conversația este cu asistentul, nu cu proprietarul.",
    at: new Date(),
  });
  await live.save();
  const record = await CallSession.create({
    userId,
    callId: live._id,
    state: "audio",
    provider: "audiosocket",
    live: true,
    note: "Sesiune AudioSocket deschisă pentru acest apel.",
  });
  let audioConnected = false;
  let watchdog;
  async function addLine(role, text) {
    if (!text) return;
    await PhoneCall.updateOne({ _id: live._id, userId }, { $push: { transcript: { role, text, at: new Date() } } });
  }
  async function finish(reason) {
    runtime.release?.(uuid);
    if (watchdog) clearTimeout(watchdog);
    const current = await PhoneCall.findOne({ _id: live._id, userId });
    const terminal = ["completed", "missed", "rejected", "failed", "ignored", "voicemail"];
    if (current && !terminal.includes(current.callStatus)) {
      const event = reason === "no-audio" || reason === "errors" ? "fail" : "hangup";
      const updated = await applyCallEvent({ userId, callId: current._id, event });
      updated.execution = reason === "no-audio" ? "channel_closed" : "voice_session";
      const note = reason === "no-audio"
        ? "AudioSocket nu s-a conectat. Apelantul nu a auzit asistentul."
        : reason === "duration"
          ? "Durata maximă a apelului s-a încheiat."
          : reason === "silence"
            ? "Apelul s-a închis după liniște."
            : "Conversația vocală s-a încheiat.";
      updated.transcript.push({ role: "system", text: note, at: new Date() });
      await updated.save();
      if (event === "hangup") await summarizeCall(userId, updated._id).catch(() => null);
      await createNotification(userId, {
        type: event === "hangup" ? "ai_call" : "ai_provider_failure",
        title: event === "hangup" ? "Apel preluat de AI" : "Calea vocală a eșuat",
        body: `${updated.callerNumber}: ${note}`,
        callId: updated._id,
      });
    }
    record.state = "closed";
    record.live = false;
    await record.save().catch(() => null);
    await ari.hangup(channelId, 16).catch(() => null);
    await ari.hangup(media.channelId, 16).catch(() => null);
    if (bridge.id) await ari.destroyBridge(bridge.id).catch(() => null);
    sessions?.delete(channelId);
    sessions?.delete(media.channelId);
  }
  const session = createVoiceSession({
    greetingPcm: greeting.pcm,
    silenceMs: settings.silenceMs,
    responseTimeoutMs: settings.responseTimeoutMs,
    maxCallDurationSeconds: settings.maxCallDurationSeconds,
    onGreeting: () => {
      audioConnected = true;
      if (watchdog) clearTimeout(watchdog);
      return addLine("assistant", greeting.text);
    },
    onInterrupt: () => conversation.interrupt(),
    promptSilence: async () => {
      const spoken = await tts.synthesize(STILL_THERE);
      await addLine("assistant", STILL_THERE);
      return spoken.pcm;
    },
    promptFailure: async () => {
      const spoken = await tts.synthesize(FAILURE);
      await addLine("assistant", FAILURE);
      return spoken.pcm;
    },
    onUtterance: async (pcm) => {
      const result = await conversation.replyToWav(wrapPcmAsWav(pcm));
      if (result?.text) await addLine("caller", result.text);
      if (result?.reply) await addLine("assistant", result.reply);
      return result;
    },
    onEnd: (reason) => finish(reason),
  });
  const book = {
    inboundId: channelId,
    outboundId: media.channelId,
    userId,
    callId: String(live._id),
    bridgeId: bridge.id,
    bridged: true,
    voice: true,
    finish: (reason = "remote") => session.end(reason),
  };
  sessions?.set(channelId, book);
  sessions?.set(media.channelId, book);
  runtime.hold?.(uuid, session);
  watchdog = setTimeout(() => {
    if (!audioConnected) session.end("no-audio");
  }, 8000);
  watchdog.unref?.();
  return { answered: true, live: true, call: live, uuid };
}
