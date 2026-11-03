const URGENT = /urgent|urgen[tț][aă]|de urgen[tț][aă]|imediat|emergency/i;
const DIRECT = /vorb(?:esc|ească|esti|ești)?\s+cu\s+alin|cu alin|transfer|să vorbesc|sa vorbesc|direct cu/i;
const CALLBACK = /să mă sune|sa ma sune|sună-mă|suna-ma|sunați|sunati|callback|ring me/i;

export function createCallSummary({ transcript, callerNumber, contactName }) {
  const callerLines = (Array.isArray(transcript) ? transcript : [])
    .filter((line) => line && line.role === "caller" && typeof line.text === "string")
    .map((line) => line.text.trim())
    .filter(Boolean);

  if (callerLines.length === 0) {
    return {
      summary: "Nu există replici ale apelantului pentru această înregistrare.",
      callerIntent: "unknown",
      requestedAction: "none",
      actionRequired: false,
      urgent: false,
      directContactRequested: false,
      callbackRequested: false,
    };
  }

  const text = callerLines.join(" ");
  const urgent = URGENT.test(text);
  const directContactRequested = DIRECT.test(text);
  const callbackRequested = CALLBACK.test(text);
  let callerIntent = "message";
  let requestedAction = "review_message";
  if (directContactRequested) {
    callerIntent = "speak_with_owner";
    requestedAction = "owner_contact_requested";
  } else if (urgent) {
    callerIntent = "urgent";
    requestedAction = "owner_attention";
  } else if (callbackRequested) {
    callerIntent = "callback";
    requestedAction = "callback_requested";
  }

  const who = contactName || callerNumber || "Apelantul";
  const quoted = callerLines.slice(0, 3).join(" ");
  const summary = `${who} a spus: ${quoted}`.slice(0, 500);

  return {
    summary,
    callerIntent,
    requestedAction,
    actionRequired: urgent || directContactRequested || callbackRequested,
    urgent,
    directContactRequested,
    callbackRequested,
  };
}
