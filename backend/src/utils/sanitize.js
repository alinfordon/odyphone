const SENSITIVE_KEY = /password|secret|token|authorization|api[-_]?key|private[-_]?key|cookie/i;

export function sanitizeMetadata(value, depth = 0) {
  if (depth > 4 || value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) return {};
  const next = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (item == null || ["string", "number", "boolean"].includes(typeof item)) {
      next[key] = item;
    }
  }
  return next;
}
