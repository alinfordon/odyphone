import { parsePhoneNumberFromString } from "libphonenumber-js";
import { ApiError } from "./errors.js";

export function normalizePhoneNumber(input, defaultCountry = "RO") {
  if (typeof input !== "string" || input.trim() === "") {
    throw new ApiError(400, "Numărul de telefon este obligatoriu.", "INVALID_PHONE");
  }
  const parsed = parsePhoneNumberFromString(input.trim(), defaultCountry);
  if (!parsed || !parsed.isValid()) {
    throw new ApiError(400, "Numărul de telefon nu este un număr E.164 valid.", "INVALID_PHONE");
  }
  return {
    phoneNumber: parsed.formatInternational(),
    normalizedPhoneNumber: parsed.number,
    country: parsed.country || defaultCountry,
  };
}

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
