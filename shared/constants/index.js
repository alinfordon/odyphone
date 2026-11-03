export const CONTACT_CATEGORIES = [
  "Family",
  "Friends",
  "Business",
  "Customers",
  "Partners",
  "Other",
];

export const RULE_ACTIONS = [
  "ai_answer",
  "ring_owner",
  "forward_to_number",
  "reject",
  "voicemail",
  "ignore",
];

export const BLOCKING_ACTIONS = ["reject", "ignore"];

export const MATCH_TYPES = ["exact_number", "contact_group", "unknown", "any"];

export const NOTIFICATION_TYPES = [
  "ai_call",
  "missed_call",
  "urgent_request",
  "direct_contact_request",
  "callback_requested",
  "telephony_disconnected",
  "ai_provider_failure",
];

export const CALL_STATUSES = [
  "ringing",
  "answered",
  "in_progress",
  "completed",
  "missed",
  "rejected",
  "failed",
  "ignored",
  "voicemail",
  "transfer_requested",
];

export const CALL_EVENTS = ["answer", "progress", "hangup", "reject", "miss", "fail", "voicemail", "ignore"];

export const DEFAULT_ASSISTANT_NAME = "ODY";
export const DEFAULT_OWNER_NAME = "Alin";
export const DEFAULT_TIME_ZONE = "Europe/Bucharest";
export const DEFAULT_COUNTRY = "RO";
export const DEFAULT_GREETING =
  "Bună ziua! Sunt ODY, asistentul virtual al lui Alin. Cu ce vă pot ajuta?";

export const ACTION_LABELS = {
  ai_answer: "Răspunde cu AI",
  ring_owner: "Sună proprietarul",
  forward_to_number: "Redirecționează către un număr",
  reject: "Respinge",
  voicemail: "Mesagerie vocală",
  ignore: "Ignoră",
};

export function buildBasePolicy({
  assistantName = DEFAULT_ASSISTANT_NAME,
  ownerName = DEFAULT_OWNER_NAME,
} = {}) {
  return [
    `Ești ${assistantName}, asistentul telefonic virtual al lui ${ownerName}. Nu ești ${ownerName}.`,
    "Reguli obligatorii:",
    "- Te prezinți clar ca asistent AI.",
    `- Nu pretinde niciodată că ești ${ownerName}.`,
    `- Nu spune că ${ownerName} a aprobat ceva fără o autorizare explicită, deja înregistrată pentru acest apel.`,
    "- Nu inventa informații, nume, ore, promisiuni sau decizii.",
    "- Nu face angajamente financiare, contractuale sau de afaceri.",
    "- Nu divulga informații private.",
    `- Nu promite că ${ownerName} va suna la o oră anume dacă acea oră nu a fost autorizată explicit.`,
    "- Când nu poți rezolva cererea, roagă apelantul să lase un mesaj.",
    "- Identifică cererile urgente.",
    `- Recunoaște cererile de a vorbi direct cu ${ownerName}.`,
    "- Oferă transfer către o persoană doar dacă transferul este configurat și disponibil în acel moment.",
    "- Folosește doar informațiile autorizate pentru contactul aflat în apel.",
    "- Identitatea apelantului nu se stabilește doar din numele afișat. Numărul poate fi falsificat.",
    "- Vorbește în limba română, natural, prietenos, politicos, profesionist, clar și concis.",
  ].join("\n");
}

export function composeAssistantInstructions({ settings, contact }) {
  const policy = buildBasePolicy({
    assistantName: settings.assistantName,
    ownerName: settings.ownerName,
  });
  const parts = [
    policy,
    settings.customSystemPrompt?.trim(),
    contact?.customInstructions?.trim()
      ? `Instrucțiuni autorizate doar pentru acest contact:\n${contact.customInstructions.trim()}`
      : "Nu există instrucțiuni suplimentare pentru acest contact. Nu folosi informații din alte contacte.",
    `Formula de întâmpinare:\n${contact?.greeting?.trim() || settings.greeting}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}
