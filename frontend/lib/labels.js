export const CATEGORIES = [
  ["Family", "Familie"],
  ["Friends", "Prieteni"],
  ["Business", "Afaceri"],
  ["Customers", "Clienți"],
  ["Partners", "Parteneri"],
  ["Other", "Altele"],
];

export const ACTIONS = [
  ["ai_answer", "Răspunde cu AI"],
  ["ring_owner", "Sună proprietarul"],
  ["forward_to_number", "Redirecționează către un număr"],
  ["reject", "Respinge"],
  ["voicemail", "Mesagerie vocală"],
  ["ignore", "Ignoră"],
];

export const MATCH_TYPES = [
  ["exact_number", "Număr exact"],
  ["contact_group", "Grup de contacte"],
  ["unknown", "Numere necunoscute"],
  ["any", "Orice apelant"],
];

export function actionLabel(action) {
  return ACTIONS.find(([value]) => value === action)?.[1] || action;
}

export function categoryLabel(category) {
  return CATEGORIES.find(([value]) => value === category)?.[1] || category;
}

export function matchLabel(matchType) {
  return MATCH_TYPES.find(([value]) => value === matchType)?.[1] || matchType;
}

export const INTENTS = {
  unknown: "Necunoscut",
  message: "Mesaj",
  speak_with_owner: "Vrea să vorbească cu proprietarul",
  urgent: "Urgent",
  callback: "Revenire",
};

export const REQUESTS = {
  none: "Nicio acțiune",
  review_message: "De citit mesajul",
  owner_contact_requested: "Contact direct cerut",
  owner_attention: "Necesită atenție",
  callback_requested: "Revenire cerută",
};

export function intentLabel(intent) {
  return INTENTS[intent] || intent || "Necunoscut";
}

export function requestLabel(action) {
  return REQUESTS[action] || action || "Nicio acțiune";
}
