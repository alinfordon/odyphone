import { BLOCKING_ACTIONS } from "../../../shared/constants/index.js";

const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function toMinutes(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(value || "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function getZonedParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "Europe/Bucharest",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return {
    weekday: WEEKDAYS[parts.weekday],
    minutes: hour * 60 + Number(parts.minute),
  };
}

export function matchesSchedule(rule, now, timeZone) {
  const schedule = rule.schedule;
  if (!schedule?.enabled) return true;
  const zoned = getZonedParts(now, timeZone);
  if (Array.isArray(schedule.days) && schedule.days.length > 0 && !schedule.days.includes(zoned.weekday)) {
    return false;
  }
  const start = toMinutes(schedule.startTime);
  const end = toMinutes(schedule.endTime);
  if (start == null || end == null || start === end) return true;
  if (start < end) return zoned.minutes >= start && zoned.minutes < end;
  return zoned.minutes >= start || zoned.minutes < end;
}

function isGeneralRule(rule) {
  return rule.matchType !== "exact_number";
}

function matchesTarget(rule, context) {
  if (rule.matchType === "exact_number") {
    return Boolean(rule.normalizedPhoneNumber) && rule.normalizedPhoneNumber === context.normalizedNumber;
  }
  if (rule.matchType === "contact_group") {
    return context.isKnown && context.contact.category === rule.category;
  }
  if (rule.matchType === "unknown") return !context.isKnown;
  if (rule.matchType === "any") return true;
  return false;
}

function nonAiAction(candidate, isKnown) {
  if (candidate && candidate !== "ai_answer") return candidate;
  return isKnown ? "ring_owner" : "ignore";
}

function forwardDestination(rule, settings) {
  return rule?.normalizedForwardTo || settings.normalizedOwnerPhoneNumber || "";
}

export function evaluateCall({
  normalizedNumber,
  contact = null,
  rules = [],
  settings,
  now = new Date(),
}) {
  const reasons = [];
  const skipped = [];
  const activeContact = contact && contact.enabled !== false ? contact : null;
  const isKnown = Boolean(activeContact);
  const threshold = settings.priorityProtectionThreshold ?? 80;
  const protectedContact = Boolean(activeContact && Number(activeContact.priority) >= threshold);

  if (contact && contact.enabled === false) {
    reasons.push("Contactul salvat este dezactivat, deci autorizarea pe grup nu se aplică.");
  }

  const ordered = [...rules]
    .filter((rule) => rule.enabled !== false)
    .sort((left, right) => {
      const priorityGap = Number(right.priority) - Number(left.priority);
      if (priorityGap !== 0) return priorityGap;
      const leftTime = new Date(left.createdAt || 0).getTime();
      const rightTime = new Date(right.createdAt || 0).getTime();
      return leftTime - rightTime;
    });

  let matched = null;
  for (const rule of ordered) {
    if (!matchesSchedule(rule, now, settings.timezone)) {
      skipped.push({ id: idOf(rule), name: rule.name, reason: "outside_schedule" });
      continue;
    }
    if (!matchesTarget(rule, { contact: activeContact, isKnown, normalizedNumber })) {
      continue;
    }
    if (protectedContact && isGeneralRule(rule) && BLOCKING_ACTIONS.includes(rule.action)) {
      skipped.push({ id: idOf(rule), name: rule.name, reason: "priority_protection" });
      reasons.push(`„${rule.name}" a fost sărită. O regulă generală nu poate bloca un contact prioritar.`);
      continue;
    }
    matched = rule;
    break;
  }

  let action;
  let source;
  if (matched) {
    action = matched.action;
    source = "rule";
    reasons.push(`S-a potrivit regula „${matched.name}" cu prioritatea ${matched.priority}.`);
  } else if (isKnown) {
    action = settings.fallbackAction || "ring_owner";
    source = "fallback";
    reasons.push("Contactul nu are o regulă activă potrivită. S-a folosit politica de rezervă.");
  } else {
    action = settings.unknownCallerAction || "ignore";
    source = "unknown_policy";
    reasons.push("Apelantul nu este un contact activ. S-a folosit politica pentru apelanți necunoscuți.");
  }

  if (protectedContact && BLOCKING_ACTIONS.includes(action) && !(matched && matched.matchType === "exact_number")) {
    action = "ring_owner";
    source = "priority_protection";
    reasons.push("Protecția priorității a înlocuit o blocare generală cu sunarea proprietarului.");
  }

  let aiSuppressed = false;
  if (action === "ai_answer") {
    const fallback = nonAiAction(matched?.fallbackAction || (isKnown ? settings.fallbackAction : settings.unknownCallerAction), isKnown);
    if (!settings.aiAnsweringEnabled) {
      action = fallback;
      aiSuppressed = true;
      source = "ai_policy_blocked";
      reasons.push("Răspunsul AI automat este oprit, deci acțiunea AI nu a fost folosită.");
    } else if (!isKnown && !settings.answerUnknownCallers) {
      action = nonAiAction(settings.unknownCallerAction, false);
      aiSuppressed = true;
      source = "ai_policy_blocked";
      reasons.push("Apelanții necunoscuți nu sunt preluați de AI decât dacă acea politică este activă.");
    } else if (isKnown && !activeContact.aiEnabled) {
      action = nonAiAction(settings.fallbackAction, true);
      aiSuppressed = true;
      source = "ai_policy_blocked";
      reasons.push("AI este oprit pentru acest contact.");
    } else {
      reasons.push("Răspunsul AI este autorizat pentru această decizie. Rezultatul nu plasează un apel telefonic.");
    }
  }

  let destination = "";
  if (action === "forward_to_number") {
    destination = forwardDestination(matched, settings);
    if (!destination) {
      action = isKnown ? nonAiAction(settings.fallbackAction, true) : nonAiAction(settings.unknownCallerAction, false);
      if (action === "forward_to_number") action = isKnown ? "ring_owner" : "ignore";
      source = "fallback";
      reasons.push("Redirecționarea nu are un număr de destinație. S-a folosit politica de rezervă.");
    }
  }

  return {
    action,
    source,
    matchedRuleId: matched ? idOf(matched) : null,
    matchedRuleName: matched?.name || null,
    contactId: contact?._id ? String(contact._id) : contact?.id || null,
    contactName: contact?.name || null,
    knownContact: isKnown,
    protectedContact,
    aiAuthorized: action === "ai_answer",
    aiSuppressed,
    forwardTo: destination || null,
    reasons,
    skipped,
    liveCall: false,
    simulated: false,
    telephonyExecuted: false,
  };
}

function idOf(rule) {
  if (!rule) return null;
  if (rule._id) return String(rule._id);
  return rule.id || null;
}
