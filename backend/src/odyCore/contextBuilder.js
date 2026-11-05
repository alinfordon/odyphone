import {
  ODY_HELP,
  ODY_IDENTITY,
  ODY_INTRODUCTION,
  ODY_SECRET_REFUSAL,
  ODY_UNKNOWN,
} from "./identity.js";
import { ODY_PERSONALITY } from "./personality.js";
import { mergeOdyRecord } from "./profile.js";

const MAX_CHARS = 4000;

export function buildOdyContext({ record = null, language = "ro", history = [], includeHistory = false, channel = "text" } = {}) {
  const merged = mergeOdyRecord(record);
  const facts = merged.profile.filter((item) => item.enabled);
  const fromAlin = facts.filter((item) => item.origin === "alin");
  const official = facts.filter((item) => item.origin === "official");
  const sections = [
    [
      `Ești ${ODY_IDENTITY.name}.`,
      ...ODY_IDENTITY.roles,
      ...ODY_IDENTITY.principles,
      `Dacă te întreabă cine ești, răspunde: ${ODY_INTRODUCTION}`,
      `Dacă te întreabă cu ce poți ajuta, răspunde: ${ODY_HELP}`,
      `Dacă ți se cere o parolă sau un secret, răspunde: ${ODY_SECRET_REFUSAL}`,
      `Dacă nu cunoști un fapt despre Alin, companie, clienți, servicii sau proiecte, răspunde: ${ODY_UNKNOWN}`,
      "La întrebări și discuții obișnuite răspunde normal și continuă conversația.",
    ].join("\n"),
    [
      `Ton: ${ODY_PERSONALITY.tone.join(", ")}.`,
      ...ODY_PERSONALITY.style,
      ...ODY_PERSONALITY.language,
      channel === "voice" ? "Conversația este vocală și continuă. Când utilizatorul vorbește, răspunde cu voce. Fiecare replică are cel mult două propoziții scurte, apoi aștepți replica următoare." : "",
      merged.personalityNotes ? `Note de personalitate:\n${merged.personalityNotes}` : "",
    ].filter(Boolean).join("\n"),
    profileSection(fromAlin, official),
    merged.instructions ? `Instrucțiuni suplimentare:\n${merged.instructions}` : "",
    language === "en"
      ? "Limba aleasă pentru această sesiune este engleza."
      : "Limba implicită a acestei sesiuni este româna.",
  ];
  if (includeHistory && history?.length) {
    const lines = history.slice(-6).map((turn) => {
      const speaker = turn.role === "model" || turn.role === "assistant" ? "ODY" : "Utilizator";
      return `${speaker}: ${String(turn.text || "").replace(/\s+/g, " ").slice(0, 180)}`;
    }).filter((line) => !line.endsWith(": "));
    if (lines.length) sections.push(`Conversația recentă:\n${lines.join("\n")}`);
  }
  let text = sections.filter(Boolean).join("\n\n");
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = text.slice(0, MAX_CHARS);
  return {
    text,
    truncated,
    identity: publicIdentity(merged),
    profile: merged.profile.map(publicFact),
  };
}

export function answerWithOdyIdentity(message, options = {}) {
  const text = String(message || "").trim();
  if (!text) return null;
  const normalized = text.toLocaleLowerCase("ro");
  const context = buildOdyContext(options);
  if (isSecretQuestion(normalized)) return ODY_SECRET_REFUSAL;
  if (isUnknownFact(normalized)) return ODY_UNKNOWN;
  if (isCompanyActivity(normalized)) return companyActivityAnswer(context.profile);
  if (isCompanyIdentity(normalized)) return companyIdentityAnswer(context.profile);
  if (/cine e[sș]ti|cine esti|tu cine|who are you/.test(normalized)) return ODY_INTRODUCTION;
  if (/cu ce (?:m[aă] |ma )?po[tț]i ajuta|cu ce ma poti ajuta|ce po[tț]i face|how can you help/.test(normalized)) return ODY_HELP;
  return null;
}

function publicIdentity(merged) {
  return {
    name: ODY_IDENTITY.name,
    user: ODY_IDENTITY.user,
    roles: ODY_IDENTITY.roles,
    principles: ODY_IDENTITY.principles,
    personality: {
      tone: ODY_PERSONALITY.tone,
      style: ODY_PERSONALITY.style,
      language: ODY_PERSONALITY.language,
      notes: merged.personalityNotes,
    },
    instructions: merged.instructions,
  };
}

function publicFact(item) {
  return {
    id: item.id,
    origin: item.origin,
    label: item.label,
    value: item.value,
    source: item.source,
    enabled: item.enabled,
  };
}

function profileSection(fromAlin, official) {
  const blocks = [];
  if (fromAlin.length) {
    blocks.push(`Informații furnizate de Alin:\n${lines(fromAlin)}`);
  }
  if (official.length) {
    const source = official.find((item) => item.source)?.source;
    const verified = source
      ? `Date oficiale, sursa ${source.url}, verificate la ${source.verifiedOn}:`
      : "Date oficiale:";
    blocks.push(`${verified}\n${lines(official)}`);
  }
  if (!blocks.length) {
    return "Nu există fapte activate în profil. Nu inventa detalii despre utilizator sau companie.";
  }
  return blocks.join("\n\n");
}

function lines(items) {
  return items.map((item) => `- ${item.label}: ${item.value}`).join("\n");
}

function isSecretQuestion(text) {
  return /parol|password|api[_ -]?key|cheie(?:a|i)? api|\.env|secretul|secrete|tokenul de acces/.test(text);
}

function isUnknownFact(text) {
  return /angaja|clien[tț]|servici|cifr[aă]|venit|website|site-ul|câți|cati|câte|cate/.test(text)
    && /webnode|compani|consulting|firm/.test(text);
}

function isCompanyActivity(text) {
  return /cu ce se ocup[aă]|activitatea principal[aă]|ce face compania/.test(text);
}

function isCompanyIdentity(text) {
  return /webnode|ce este compania/.test(text);
}

function enabledValue(profile, id) {
  return profile.find((item) => item.id === id && item.enabled)?.value || "";
}

function companyIdentityAnswer(profile) {
  const name = enabledValue(profile, "company-name");
  const relation = enabledValue(profile, "company-relation");
  if (!name && !relation) return ODY_UNKNOWN;
  const parts = [];
  if (name) parts.push(`Denumirea oficială este ${name}.`);
  if (relation) parts.push(relation);
  parts.push("Nu am informații despre clienți, cifre sau o listă de servicii.");
  return parts.join(" ");
}

function companyActivityAnswer(profile) {
  const activity = enabledValue(profile, "company-activity");
  if (!activity) return ODY_UNKNOWN;
  const caen = enabledValue(profile, "company-caen");
  const activityText = activity.replace(/\.$/, "");
  const caenText = caen ? ` Codul CAEN confirmat este ${caen}` : "";
  return `Activitatea principală confirmată este ${activityText}.${caenText} Nu am o listă de servicii, clienți sau cifre.`;
}
