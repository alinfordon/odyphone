import { PhoneCall } from "../models/PhoneCall.js";
import { PhoneContact } from "../models/PhoneContact.js";
import { getSettings } from "./settingsService.js";

function zonedDay(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function zonedStart(timeZone, isoDate) {
  const guess = new Date(`${isoDate}T00:00:00.000Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(guess).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour) % 24;
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  const offset = asUtc - guess.getTime();
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) - offset);
}

function startOfZonedDay(timeZone, dayOffset = 0) {
  return zonedStart(timeZone, addDays(zonedDay(new Date(), timeZone), dayOffset));
}

function addDays(isoDate, days) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

async function realCalls(userId, extra = {}) {
  return PhoneCall.find({ userId, simulated: { $ne: true }, ...extra }).sort({ startedAt: -1 });
}

export async function getOverview(userId) {
  const settings = await getSettings(userId);
  const timeZone = settings.timezone || "Europe/Bucharest";
  const todayStart = startOfZonedDay(timeZone, 0);
  const todayCalls = await realCalls(userId, { startedAt: { $gte: todayStart } });
  const durations = todayCalls.filter((call) => call.callStatus === "completed" && call.duration != null).map((call) => call.duration);
  const recent = await realCalls(userId);
  const recentSlice = recent.slice(0, 8);
  const contactIds = recentSlice.map((call) => call.contactId).filter(Boolean);
  const contacts = await PhoneContact.find({ _id: { $in: contactIds }, userId });
  const names = new Map(contacts.map((contact) => [String(contact._id), contact.name]));
  const pending = recent.filter(
    (call) => call.requestedAction === "callback_requested" && call.actionRequired && !call.attentionResolved,
  );
  const activityMap = new Map();
  for (const call of recent) {
    const key = call.normalizedCallerNumber;
    if (activityMap.has(key)) continue;
    activityMap.set(key, {
      callerNumber: call.callerNumber,
      contactName: names.get(String(call.contactId)) || null,
      lastAt: call.startedAt,
      callStatus: call.callStatus,
    });
    if (activityMap.size === 6) break;
  }
  return {
    today: {
      total: todayCalls.length,
      aiAnswered: todayCalls.filter((call) => call.aiHandled).length,
      missed: todayCalls.filter((call) => call.callStatus === "missed").length,
      averageDurationSeconds: average(durations),
      needsAttention: todayCalls.filter((call) => call.actionRequired && !call.attentionResolved).length,
    },
    recentCalls: recentSlice.map((call) => ({
      ...call.toPublic(),
      contactName: names.get(String(call.contactId)) || null,
    })),
    recentActivity: [...activityMap.values()],
    pendingCallbacks: pending.slice(0, 6).map((call) => ({
      id: String(call._id),
      callerNumber: call.callerNumber,
      summary: call.summary,
      startedAt: call.startedAt,
    })),
    hasAnyCalls: recent.length > 0,
  };
}

export async function getAnalytics(userId) {
  const settings = await getSettings(userId);
  const timeZone = settings.timezone || "Europe/Bucharest";
  const since = startOfZonedDay(timeZone, -13);
  const calls = await realCalls(userId, { startedAt: { $gte: since } });
  if (calls.length === 0) {
    return {
      series: [],
      distribution: [],
      totals: { calls: 0, aiAnswered: 0, missed: 0, averageDurationSeconds: null },
    };
  }
  const days = [];
  for (let offset = -13; offset <= 0; offset += 1) {
    days.push(addDays(zonedDay(new Date(), timeZone), offset));
  }
  const buckets = new Map(days.map((day) => [day, { day, total: 0, aiAnswered: 0, missed: 0 }]));
  for (const call of calls) {
    const key = zonedDay(call.startedAt, timeZone);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    if (call.aiHandled) bucket.aiAnswered += 1;
    if (call.callStatus === "missed") bucket.missed += 1;
  }
  const aiAnswered = calls.filter((call) => call.aiHandled).length;
  const missed = calls.filter((call) => call.callStatus === "missed").length;
  const other = calls.length - aiAnswered - missed;
  const durations = calls.filter((call) => call.duration != null && call.callStatus === "completed").map((call) => call.duration);
  return {
    series: [...buckets.values()],
    distribution: [
      { name: "Răspuns AI", value: aiAnswered },
      { name: "Pierdute", value: missed },
      { name: "Altele", value: Math.max(0, other) },
    ].filter((item) => item.value > 0),
    totals: {
      calls: calls.length,
      aiAnswered,
      missed,
      averageDurationSeconds: average(durations),
    },
  };
}
