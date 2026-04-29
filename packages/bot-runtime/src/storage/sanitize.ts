const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/g,
  /\b[A-Za-z0-9]{32,}\b/g,
];

const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  /(\+?\d{1,3}[\s\-]?)?(?:\(?\d{3,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{4}/g,
];

function sanitizeString(s: string): string {
  let out = s;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "<redacted:secret>");
  for (const re of PII_PATTERNS) out = out.replace(re, "<redacted:pii>");
  return out;
}

export function sanitize<T>(value: T): T {
  if (typeof value === "string") return sanitizeString(value) as T;
  if (Array.isArray(value)) return value.map((v) => sanitize(v)) as T;
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitize(v);
    }
    return result as T;
  }
  return value;
}
