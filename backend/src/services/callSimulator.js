import { getEnv } from "../config/env.js";
import { ApiError } from "../utils/errors.js";
import { applyCallEvent, beginIncomingCall } from "./callService.js";

const SIMULATION_NOTE = "Simulare. Niciun canal telefonic nu a fost contactat.";

export async function simulateCallLifecycle({ userId, phoneNumber, now = new Date() }) {
  if (!getEnv().developmentMode) {
    throw new ApiError(403, "Simulatorul este disponibil doar în modul de dezvoltare.", "SIMULATOR_DISABLED");
  }
  const started = await beginIncomingCall({
    userId,
    callerNumber: phoneNumber,
    simulated: true,
    now,
  });
  const callId = started.call._id;
  const action = started.decision.action;
  const steps = [];
  async function step(event, at) {
    steps.push(event);
    return applyCallEvent({ userId, callId, event, at });
  }
  let call;
  if (action === "reject") call = await step("reject", now);
  else if (action === "ignore") call = await step("ignore", now);
  else if (action === "voicemail") call = await step("voicemail", now);
  else if (action === "ai_answer") {
    call = await step("answer", now);
    call = await step("progress", new Date(now.getTime() + 1000));
    call = await step("hangup", new Date(now.getTime() + 5000));
  } else {
    call = await step("miss", now);
  }
  call.simulated = true;
  call.execution = "not_executed";
  call.transcript.push({ role: "system", text: SIMULATION_NOTE, at: now });
  await call.save();
  return {
    call: call.toPublic(),
    decision: started.decision,
    steps,
    simulated: true,
    liveCall: false,
    telephonyExecuted: false,
    message: SIMULATION_NOTE,
  };
}
