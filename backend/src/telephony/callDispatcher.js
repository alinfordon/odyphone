import { PhoneCall } from "../models/PhoneCall.js";
import { applyCallEvent, beginIncomingCall } from "../services/callService.js";
import { createNotification } from "../services/notificationService.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { getEnv } from "../config/env.js";
import { connectAiVoice } from "../audio/voiceBridge.js";
import { voiceCanAnswer } from "../audio/voiceRuntime.js";
import { assertChannelId, buildTrunkEndpoint } from "./ariSafety.js";

const NOTES = {
  reject: "Canalul real a fost respins. Apelul nu a fost preluat.",
  ignore: "Canalul real a fost închis. Apelul a fost ignorat.",
  ai: "Răspunsul AI nu preia linia. Nu există cale audio, iar canalul a fost închis fără răspuns.",
  voicemail: "Mesageria vocală nu este conectată. Canalul a fost închis fără răspuns.",
  noTrunk: "Destinația nu a fost sunată. Șablonul de trunchi nu este configurat.",
  badTarget: "Destinația nu a fost sunată. Numărul nu poate fi pus în șablonul de trunchi.",
  originateFailed: "Destinația configurată nu a putut fi sunată. Apelantul nu a fost preluat.",
  dialFailed: "Legătura către destinație a eșuat. Canalul a fost închis.",
};

export function createChannelBook() {
  return new Map();
}

async function remember(call, { execution, note }) {
  call.execution = execution;
  call.transcript.push({ role: "system", text: note, at: new Date() });
  await call.save();
  return call;
}

async function closeUnanswered({ ari, channelId, userId, call, event, note, reasonCode = 16 }) {
  let executed = false;
  try {
    const result = await ari.hangup(channelId, reasonCode);
    executed = Boolean(result?.executed);
  } catch {
    executed = false;
  }
  const updated = await applyCallEvent({ userId, callId: call._id, event });
  await remember(updated, { execution: executed ? "channel_closed" : "not_executed", note });
  await createNotification(userId, {
    type: event === "reject" ? "missed_call" : "missed_call",
    title: event === "reject" ? "Apel respins" : "Apel închis fără răspuns",
    body: `${updated.callerNumber}: ${note}`,
    callId: updated._id,
  });
  return { call: updated, live: false, answered: false, telephonyExecuted: executed };
}

export async function handleInboundStasis({ channel, userId, ari, trunkTemplate = "", ownerNumber = "", sessions }) {
  const channelId = assertChannelId(channel?.id);
  const existing = await PhoneCall.findOne({ providerCallId: channelId });
  if (existing) return { duplicate: true, call: existing, live: false, answered: false };
  const rawNumber = String(channel?.caller?.number || "").trim();
  let callerNumber = rawNumber;
  try {
    callerNumber = normalizePhoneNumber(rawNumber).phoneNumber;
  } catch {
    await ari.hangup(channelId, 16).catch(() => null);
    return { rejected: true, reason: "invalid_caller", live: false, answered: false };
  }
  const { call, decision } = await beginIncomingCall({
    userId,
    callerNumber,
    providerCallId: channelId,
    simulated: false,
  });
  const action = decision.action;
  if (action === "reject") {
    return closeUnanswered({ ari, channelId, userId, call, event: "reject", note: NOTES.reject, reasonCode: 17 });
  }
  if (action === "ignore") {
    return closeUnanswered({ ari, channelId, userId, call, event: "ignore", note: NOTES.ignore });
  }
  if (action === "ai_answer") {
    if (voiceCanAnswer(getEnv())) {
      const voiced = await connectAiVoice({ ari, channelId, userId, call, sessions });
      if (voiced.answered || voiced.failed) return voiced;
    }
    return closeUnanswered({ ari, channelId, userId, call, event: "miss", note: NOTES.ai });
  }
  if (action === "voicemail") {
    return closeUnanswered({ ari, channelId, userId, call, event: "fail", note: NOTES.voicemail });
  }
  const target = action === "forward_to_number" ? decision.forwardTo : ownerNumber;
  if (!trunkTemplate) {
    return closeUnanswered({ ari, channelId, userId, call, event: "miss", note: NOTES.noTrunk });
  }
  let endpoint = "";
  try {
    endpoint = buildTrunkEndpoint(trunkTemplate, target || "");
  } catch {
    return closeUnanswered({ ari, channelId, userId, call, event: "miss", note: NOTES.badTarget });
  }
  await ari.ring?.(channelId).catch(() => null);
  let originated = { executed: false, channelId: "" };
  try {
    originated = await ari.originate({ endpoint, appArgs: `dialed,${channelId}` });
  } catch {
    originated = { executed: false, channelId: "" };
  }
  if (!originated.executed) {
    await ari.stopRing?.(channelId).catch(() => null);
    return closeUnanswered({ ari, channelId, userId, call, event: "miss", note: NOTES.originateFailed });
  }
  sessions?.set(channelId, {
    inboundId: channelId,
    outboundId: originated.channelId,
    userId,
    callId: String(call._id),
    bridgeId: "",
    bridged: false,
  });
  if (originated.channelId) {
    sessions?.set(originated.channelId, sessions.get(channelId));
  }
  call.execution = "telephony_pending";
  call.transcript.push({ role: "system", text: "Se sună destinația configurată. Apelantul nu este preluat de AI.", at: new Date() });
  await call.save();
  return { call, pending: true, live: false, answered: false, telephonyExecuted: false };
}

export async function handleOutboundStasis({ inboundId, outboundId, ari, sessions }) {
  const session = sessions?.get(inboundId);
  if (!session || session.bridged) {
    await ari.hangup(outboundId, 16).catch(() => null);
    return { bridged: false, live: false };
  }
  await ari.stopRing?.(inboundId).catch(() => null);
  const bridge = await ari.createBridge();
  if (!bridge.executed) {
    await ari.hangup(inboundId, 16).catch(() => null);
    await ari.hangup(outboundId, 16).catch(() => null);
    const failed = await applyCallEvent({ userId: session.userId, callId: session.callId, event: "fail" });
    await remember(failed, { execution: "channel_closed", note: NOTES.dialFailed });
    sessions.delete(inboundId);
    if (session.outboundId) sessions.delete(session.outboundId);
    return { bridged: false, live: false };
  }
  const inboundAdded = await ari.addToBridge(bridge.id, inboundId);
  const outboundAdded = await ari.addToBridge(bridge.id, outboundId);
  if (!inboundAdded.executed || !outboundAdded.executed) {
    await ari.destroyBridge(bridge.id).catch(() => null);
    await ari.hangup(inboundId, 16).catch(() => null);
    await ari.hangup(outboundId, 16).catch(() => null);
    const failed = await applyCallEvent({ userId: session.userId, callId: session.callId, event: "fail" });
    await remember(failed, { execution: "channel_closed", note: NOTES.dialFailed });
    sessions.delete(inboundId);
    sessions.delete(outboundId);
    return { bridged: false, live: false };
  }
  session.bridged = true;
  session.bridgeId = bridge.id;
  session.outboundId = outboundId;
  sessions.set(outboundId, session);
  await applyCallEvent({ userId: session.userId, callId: session.callId, event: "answer" });
  const progressed = await applyCallEvent({ userId: session.userId, callId: session.callId, event: "progress" });
  progressed.execution = "telephony_pending";
  progressed.transcript.push({ role: "system", text: "Apelantul a fost conectat la destinația configurată, nu la AI.", at: new Date() });
  await progressed.save();
  return { bridged: true, live: false, answered: true, call: progressed };
}

export async function handleChannelDestroyed({ channelId, ari, sessions }) {
  const session = sessions?.get(channelId);
  if (!session) return { ignored: true };
  sessions.delete(session.inboundId);
  if (session.outboundId) sessions.delete(session.outboundId);
  const peerId = channelId === session.inboundId ? session.outboundId : session.inboundId;
  if (peerId) await ari.hangup(peerId, 16).catch(() => null);
  if (session.bridgeId) await ari.destroyBridge(session.bridgeId).catch(() => null);
  if (typeof session.finish === "function") {
    await session.finish("remote");
    return { closed: true, live: false };
  }
  const current = await PhoneCall.findById(session.callId);
  if (!current || ["completed", "missed", "rejected", "failed", "ignored", "voicemail"].includes(current.callStatus)) {
    return { closed: true, live: false };
  }
  const event = session.bridged ? "hangup" : "miss";
  const updated = await applyCallEvent({ userId: session.userId, callId: session.callId, event });
  await remember(updated, {
    execution: "channel_closed",
    note: session.bridged ? "Canalul conectat s-a închis." : "Destinația nu a răspuns. Apelantul nu a fost preluat.",
  });
  await createNotification(session.userId, {
    type: "missed_call",
    title: session.bridged ? "Apel încheiat" : "Apel închis fără răspuns",
    body: updated.callerNumber,
    callId: updated._id,
  });
  return { closed: true, live: false, call: updated };
}
