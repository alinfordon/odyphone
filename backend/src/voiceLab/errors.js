const SECRET = /(?:AIza[\w-]{8,}|Bearer\s+\S+|api[_-]?key["']?\s*[:=]\s*\S+|x-goog-api-key["']?\s*[:=]\s*\S+)/gi;

export function publicError(error) {
  const source = typeof error === "string" ? error : error?.message;
  return String(source || "Eroare necunoscută")
    .replace(SECRET, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[url]")
    .slice(0, 300);
}
