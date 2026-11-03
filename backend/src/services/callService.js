import { PhoneCall } from "../models/PhoneCall.js";
import { PhoneContact } from "../models/PhoneContact.js";
import { PhoneRule } from "../models/PhoneRule.js";
import { ApiError, notFound } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import { escapeRegex, normalizePhoneNumber } from "../utils/phone.js";
import { readPage } from "../utils/http.js";
import { evaluateCall } from "./ruleEngine.js";
import { getSettings } from "./settingsService.js";
import { createCallSummary } from "./summaryService.js";
import { createNotification } from "./notificationService.js";

const SORTS = {
  startedAt: { startedAt: -1 },
  duration: { duration: -1 },
  status: { callStatus: 1, startedAt: -1 },
};

function secondsBetween(start, end) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

export async function beginIncomingCall({ userId, callerNumber, providerCallId = null, simulated = false, now = new Date() }) {
  const settings = await getSettings(userId);
  const phone = normalizePhoneNumber(callerNumber, settings.defaultCountry);
  const contact = await PhoneContact.findOne({
    userId,
    normalizedPhoneNumber: phone.normalizedPhoneNumber,
  }).sort({ enabled: -1, priority: -1 });
  const rules = await PhoneRule.find({ userId, enabled: true });
  const decision = evaluateCall({
    normalizedNumber: phone.normalizedPhoneNumber,
    contact,
    rules,
    settings,
    now,
  });
  const call = await PhoneCall.create({
    userId,
    callerNumber: phone.phoneNumber,
    normalizedCallerNumber: phone.normalizedPhoneNumber,
    contactId: contact?._id || null,
    direction: "inbound",
    callStatus: "ringing",
    startedAt: now,
    aiHandled: false,
    simulated,
    execution: "not_executed",
    ruleApplied: {
      ruleId: decision.matchedRuleId,
      name: decision.matchedRuleName || "",
      action: decision.action,
      source: decision.source,
    },
    providerCallId,
    recordingReference: null,
  });
  return { call, decision };
}

export async function applyCallEvent({ userId, callId, event, at = new Date() }) {
  assertObjectId(callId, "call id");
  const call = await PhoneCall.findOne({ _id: callId, userId });
  if (!call) throw notFound("Apelul nu a fost găsit.");
  const from = call.callStatus;
  const allowed = {
    ringing: ["answer", "reject", "miss", "fail", "voicemail", "ignore"],
    answered: ["progress", "hangup", "fail"],
    in_progress: ["hangup", "fail"],
  };
  if (!allowed[from]?.includes(event)) {
    throw new ApiError(409, `Evenimentul „${event}" nu poate fi aplicat cât timp apelul este „${from}".`, "INVALID_TRANSITION");
  }
  if (event === "answer") {
    call.callStatus = "answered";
    call.answeredAt = at;
    call.aiHandled = call.ruleApplied?.action === "ai_answer";
  } else if (event === "progress") {
    call.callStatus = "in_progress";
  } else if (event === "hangup") {
    call.callStatus = "completed";
    call.endedAt = at;
    call.duration = secondsBetween(call.answeredAt || call.startedAt, at);
  } else if (event === "reject") {
    call.callStatus = "rejected";
    call.endedAt = at;
    call.duration = 0;
    call.aiHandled = false;
  } else if (event === "miss") {
    call.callStatus = "missed";
    call.endedAt = at;
    call.duration = 0;
    call.aiHandled = false;
  } else if (event === "fail") {
    call.callStatus = "failed";
    call.endedAt = at;
    call.aiHandled = false;
  } else if (event === "voicemail") {
    call.callStatus = "voicemail";
    call.endedAt = at;
    call.duration = 0;
    call.aiHandled = false;
  } else if (event === "ignore") {
    call.callStatus = "ignored";
    call.endedAt = at;
    call.duration = 0;
    call.aiHandled = false;
  }
  if (call.execution === "live") call.execution = "not_executed";
  await call.save();
  return call;
}

export async function listCalls(userId, query) {
  const { page, limit, skip } = readPage(query);
  const filter = { userId };
  if (query.includeSimulated !== "true") filter.simulated = { $ne: true };
  if (query.status) filter.callStatus = query.status;
  if (query.aiHandled === "true") filter.aiHandled = true;
  if (query.aiHandled === "false") filter.aiHandled = false;
  if (query.actionRequired === "true") {
    filter.actionRequired = true;
    filter.attentionResolved = { $ne: true };
  }
  if (query.from || query.to) {
    filter.startedAt = {};
    if (query.from) filter.startedAt.$gte = new Date(query.from);
    if (query.to) filter.startedAt.$lte = new Date(query.to);
  }
  if (query.q) {
    const safe = escapeRegex(query.q.trim());
    const contacts = await PhoneContact.find({
      userId,
      name: { $regex: safe, $options: "i" },
    }).select("_id");
    filter.$or = [
      { callerNumber: { $regex: safe, $options: "i" } },
      { normalizedCallerNumber: { $regex: safe, $options: "i" } },
      { summary: { $regex: safe, $options: "i" } },
      { contactId: { $in: contacts.map((item) => item._id) } },
    ];
  }
  const sort = SORTS[query.sort] || SORTS.startedAt;
  const [items, total] = await Promise.all([
    PhoneCall.find(filter).sort(sort).skip(skip).limit(limit),
    PhoneCall.countDocuments(filter),
  ]);
  const contactIds = items.map((item) => item.contactId).filter(Boolean);
  const contacts = await PhoneContact.find({ _id: { $in: contactIds }, userId });
  const names = new Map(contacts.map((contact) => [String(contact._id), contact.name]));
  return {
    items: items.map((call) => ({
      ...call.toPublic(),
      contactName: names.get(String(call.contactId)) || null,
    })),
    meta: { page, limit, total, pages: total === 0 ? 0 : Math.ceil(total / limit) },
  };
}

export async function getCall(userId, id) {
  assertObjectId(id, "call id");
  const call = await PhoneCall.findOne({ _id: id, userId });
  if (!call) throw notFound("Apelul nu a fost găsit.");
  let contactName = null;
  if (call.contactId) {
    const contact = await PhoneContact.findOne({ _id: call.contactId, userId });
    contactName = contact?.name || null;
  }
  return { ...call.toPublic(), contactName };
}

export async function updateCallFlags(userId, id, input) {
  const call = await PhoneCall.findOne({ _id: id, userId });
  if (!call) throw notFound("Apelul nu a fost găsit.");
  if (input.read !== undefined) {
    call.read = input.read;
  }
  if (input.attentionResolved !== undefined) {
    call.attentionResolved = input.attentionResolved;
  }
  await call.save();
  return getCall(userId, id);
}

export async function deleteCall(userId, id) {
  assertObjectId(id, "call id");
  const call = await PhoneCall.findOne({ _id: id, userId });
  if (!call) throw notFound("Apelul nu a fost găsit.");
  await call.deleteOne();
  return { id: String(id), deleted: true };
}

export async function summarizeCall(userId, id) {
  const call = await PhoneCall.findOne({ _id: id, userId });
  if (!call) throw notFound("Apelul nu a fost găsit.");
  if (!call.transcript?.length) {
    throw new ApiError(400, "Acest apel nu are o transcriere de rezumat.", "NO_TRANSCRIPT");
  }
  let contactName = null;
  if (call.contactId) {
    const contact = await PhoneContact.findOne({ _id: call.contactId, userId });
    contactName = contact?.name || null;
  }
  const summary = createCallSummary({
    transcript: call.transcript,
    callerNumber: call.callerNumber,
    contactName,
  });
  call.summary = summary.summary;
  call.callerIntent = summary.callerIntent;
  call.requestedAction = summary.requestedAction;
  call.actionRequired = summary.actionRequired;
  await call.save();
  if (summary.urgent) {
    await createNotification(userId, {
      type: "urgent_request",
      title: "Cerere urgentă",
      body: summary.summary,
      callId: call._id,
    });
  }
  if (summary.directContactRequested) {
    await createNotification(userId, {
      type: "direct_contact_request",
      title: "Apelantul a cerut contact direct",
      body: summary.summary,
      callId: call._id,
    });
  }
  if (summary.callbackRequested) {
    await createNotification(userId, {
      type: "callback_requested",
      title: "Revenire cerută",
      body: summary.summary,
      callId: call._id,
    });
  }
  return getCall(userId, id);
}

export async function callsForExport(userId) {
  const result = await listCalls(userId, { page: 1, limit: 100, includeSimulated: "false" });
  return result.items.map((call) => ({
    callerNumber: call.callerNumber,
    contactName: call.contactName,
    direction: call.direction,
    callStatus: call.callStatus,
    startedAt: call.startedAt,
    duration: call.duration,
    aiHandled: call.aiHandled,
    execution: call.execution,
    simulated: call.simulated,
    summary: call.summary,
    callerIntent: call.callerIntent,
    requestedAction: call.requestedAction,
    actionRequired: call.actionRequired,
    transcript: (call.transcript || [])
      .filter((line) => line.role === "caller" || line.role === "assistant")
      .map((line) => `${line.role === "caller" ? "Apelant" : "Asistent"}: ${line.text}`)
      .join(" | ")
      .slice(0, 500),
  }));
}

export function toCsv(rows) {
  const headers = [
    "callerNumber",
    "contactName",
    "direction",
    "callStatus",
    "startedAt",
    "duration",
    "aiHandled",
    "execution",
    "simulated",
    "summary",
    "callerIntent",
    "requestedAction",
    "actionRequired",
    "transcript",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((key) => csvCell(row[key])).join(","));
  }
  return lines.join("\n");
}

function csvCell(value) {
  const text = value == null ? "" : String(value);
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
