import { ApiError } from "../utils/errors.js";

export const COMPANY_SOURCE = {
  name: "ListaFirme",
  url: "https://listafirme.ro/webnode-consulting-srl-41756371/",
  verifiedOn: "2026-11-03",
};

const official = (id, label, value) => ({
  id,
  origin: "official",
  label,
  value,
  source: COMPANY_SOURCE,
  enabled: true,
});

const fromAlin = (id, label, value) => ({
  id,
  origin: "alin",
  label,
  value,
  enabled: true,
});

export const ODY_PROFILE = [
  fromAlin("user", "Utilizator principal", "Utilizatorul principal este Alin Fordon."),
  fromAlin("work", "Activitate", "Alin Fordon spune că dezvoltă proiecte software și soluții bazate pe inteligență artificială."),
  fromAlin("company-relation", "Companie, declarat de Alin", "Alin Fordon spune că WEBNODE CONSULTING SRL este compania sa."),
  fromAlin("project", "Proiect", "ODY este unul dintre proiectele principale ale lui Alin."),
  fromAlin("stack", "Tehnologii", "Alin spune că lucrează cu Next.js, Node.js, JavaScript și MongoDB."),
  fromAlin("domains", "Domenii", "Alin spune că dezvoltă proiecte de AI, automatizări, robotică și aplicații web."),
  fromAlin("preference", "Preferință", "Alin spune că preferă soluțiile practice, implementabile și dezvoltate incremental."),
  official("company-name", "Denumire", "WEBNODE CONSULTING SRL"),
  official("company-cui", "CUI", "41756371"),
  official("company-registry", "Număr Registrul Comerțului", "J05/2377/2019"),
  official("company-founded", "Înființare", "11.10.2019"),
  official("company-activity", "Activitate principală", "Consultanță în tehnologia informației."),
  official("company-caen", "CAEN", "6202 Rev. 2 (echivalent CAEN 6220 Rev. 3, conform sursei consultate)."),
  official("company-hq", "Sediu", "Ștei, județul Bihor."),
  official("company-source", "Sursă verificată", "ListaFirme, https://listafirme.ro/webnode-consulting-srl-41756371/, verificat la 03.11.2026."),
];

const SECRET = /(?:AIza[\w-]{8,}|Bearer\s+\S+|api[_-]?key\s*[:=]\s*\S+|parola\s+(?:este|=|:)\s*\S+)/i;
const SECRET_STRIP = new RegExp(SECRET.source, "gi");

export function assertNoSecret(value) {
  const text = String(value ?? "");
  if (SECRET.test(text)) {
    throw new ApiError(400, "Textul nu poate conține secrete.", "ODY_CORE_SECRET");
  }
  // eslint-disable-next-line no-control-regex -- Remove unsafe control characters
  return text.replace(/[\u0000-\u001f]/g, " ").trim();
}

export function mergeOdyRecord(record) {
  const saved = new Map((record?.profile || []).map((item) => [item.id, item]));
  return {
    personalityNotes: stripText(record?.personalityNotes, 1000),
    instructions: stripText(record?.instructions, 2000),
    profile: ODY_PROFILE.map((item) => {
      const override = saved.get(item.id);
      const value = stripText(override?.value, 400) || item.value;
      return {
        id: item.id,
        origin: item.origin,
        label: item.label,
        value,
        source: item.source || null,
        enabled: override ? override.enabled !== false : item.enabled !== false,
      };
    }),
  };
}

export function profileItemsForSave(items) {
  if (!Array.isArray(items)) {
    throw new ApiError(400, "Profilul trebuie să conțină lista de informații.", "VALIDATION_ERROR");
  }
  const allowed = new Set(ODY_PROFILE.map((item) => item.id));
  const seen = new Set();
  for (const item of items) {
    if (!allowed.has(item?.id) || seen.has(item.id)) {
      throw new ApiError(400, "Profilul conține o informație necunoscută.", "VALIDATION_ERROR");
    }
    seen.add(item.id);
  }
  if (seen.size !== allowed.size) {
    throw new ApiError(400, "Profilul trebuie să includă toate informațiile existente.", "VALIDATION_ERROR");
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  return ODY_PROFILE.map((item) => {
    const input = byId.get(item.id);
    const value = assertNoSecret(input.value);
    if (!value || value.length > 400) {
      throw new ApiError(400, "Fiecare informație din profil are între 1 și 400 de caractere.", "VALIDATION_ERROR");
    }
    return { id: item.id, enabled: Boolean(input.enabled), value };
  });
}

function stripText(value, max) {
  return String(value || "")
    .replace(SECRET_STRIP, "")
    // eslint-disable-next-line no-control-regex -- Remove unsafe control characters
    .replace(/[\u0000-\u001f]/g, " ")
    .trim()
    .slice(0, max);
}
