import { PhoneCall } from "../models/PhoneCall.js";
import { ApiError, notFound } from "../utils/errors.js";
import { assertObjectId } from "../utils/objectId.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { getSettings } from "./settingsService.js";

const ACTIVE = new Set(["ringing", "answered", "in_progress"]);

export async function requestTransfer({ userId, callId, targetNumber }) {
  assertObjectId(callId, "call id");
  const call = await PhoneCall.findOne({ _id: callId, userId });
  if (!call) throw notFound("Apelul nu a fost găsit.");
  if (!ACTIVE.has(call.callStatus)) {
    throw new ApiError(409, "Transferul este disponibil doar cât timp apelul este activ.", "CALL_NOT_ACTIVE");
  }
  const settings = await getSettings(userId);
  const phone = normalizePhoneNumber(targetNumber, settings.defaultCountry);
  const allowed = new Set(
    [settings.normalizedOwnerPhoneNumber, ...(settings.allowedTransferNumbers || [])].filter(Boolean),
  );
  if (!allowed.has(phone.normalizedPhoneNumber)) {
    const error = new ApiError(403, "Această destinație nu este un număr de transfer autorizat.", "TRANSFER_DENIED");
    error.audit = { authorized: false, target: phone.normalizedPhoneNumber };
    throw error;
  }
  call.transferRequest = {
    target: phone.normalizedPhoneNumber,
    authorized: true,
    executed: false,
    detail: "Transferul a fost autorizat și nu a fost trimis. Nu este conectat niciun furnizor de telefonie.",
    at: new Date(),
  };
  await call.save();
  const error = new ApiError(
    503,
    "Transferul a fost autorizat și nu a fost trimis. Nu este conectat niciun furnizor de telefonie.",
    "TELEPHONY_NOT_CONNECTED",
  );
  error.payload = {
    authorized: true,
    executed: false,
    liveCall: false,
    target: phone.normalizedPhoneNumber,
    call: call.toPublic(),
  };
  throw error;
}
