const STATUS = {
  unknown: "necunoscut",
  checking: "se verifică",
  ringing: "Sună",
  answered: "Răspuns",
  in_progress: "În desfășurare",
  completed: "Încheiat",
  missed: "Pierdut",
  rejected: "Respins",
  failed: "Eșuat",
  ignored: "Ignorat",
  voicemail: "Mesagerie vocală",
  transfer_requested: "Transfer cerut",
  not_configured: "neconfigurat",
  not_connected: "neconectat",
  connected: "conectat",
  disconnected: "deconectat",
  ready: "gata pentru test manual",
  blocked: "blocat",
  listening: "ascultă",
  down: "oprit",
  reachable: "accesibil",
  unreachable: "inaccesibil",
  not_executed: "netrimis în rețea",
  telephony_pending: "telefonie în așteptare",
  channel_closed: "canal închis fără preluare AI",
  voice_session: "sesiune vocală",
  ai_call: "Apel AI",
  missed_call: "Apel pierdut",
  urgent_request: "Cerere urgentă",
  direct_contact_request: "Cerere de contact direct",
  callback_requested: "Cerere de revenire",
  telephony_disconnected: "Telefonie deconectată",
  ai_provider_failure: "Eroare furnizor AI",
};

export function formatWhen(value, timeZone = "Europe/Bucharest") {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ro-RO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}

export function formatDuration(seconds) {
  if (seconds == null) return "—";
  const total = Number(seconds);
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  if (minutes === 0) return `${remain} sec`;
  return `${minutes} min ${remain} sec`;
}

export function statusLabel(value) {
  const key = String(value || "unknown");
  return STATUS[key] || key.replaceAll("_", " ");
}
