/**
 * Sanitizer. Phase 11 hardens to redact PII from any text persisted to disk
 * or sent to channels. Patterns covered (per requirement §10.1 #45):
 *   - email
 *   - phone (E.164 + common 10-11 digit forms)
 *   - api_key / bearer_token (heuristic: long alphanumeric secrets)
 *   - credit_card (Luhn-validated 13-19 digit run)
 *   - national id (US SSN, CN 18-digit shape)
 *
 * The sanitizer is conservative: when in doubt, leave alone. Detected
 * matches are replaced with `<redacted:{kind}>`.
 */

interface RedactRule {
  kind: string;
  re: RegExp;
  validate?: (match: string) => boolean;
}

const RULES: RedactRule[] = [
  {
    kind: 'email',
    re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  {
    kind: 'bearer_token',
    re: /\bBearer\s+[A-Za-z0-9._-]{8,}/gi,
  },
  {
    kind: 'api_key',
    re: /\b(?:sk|pk|key|token|secret)[_-][A-Za-z0-9_-]{16,}/gi,
  },
  {
    kind: 'credit_card',
    re: /\b(?:\d[ -]?){13,19}\b/g,
    validate: (m) => luhn(m.replace(/\D/g, '')),
  },
  {
    kind: 'ssn',
    re: /\b\d{3}-\d{2}-\d{4}\b/g,
  },
  {
    kind: 'cn_id_card',
    re: /\b\d{17}[\dXx]\b/g,
  },
  {
    kind: 'phone',
    re: /(?<!\d)(\+?\d{1,3}[\s-]?)?(\(?\d{3,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}(?!\d)/g,
    validate: (m) => m.replace(/\D/g, '').length >= 7,
  },
];

function luhn(d: string): boolean {
  if (d.length < 13 || d.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48;
    if (n < 0 || n > 9) return false;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function sanitizeText(input: string): string {
  if (!input) return input;
  let out = input;
  for (const r of RULES) {
    out = out.replace(r.re, (match) => {
      if (r.validate && !r.validate(match)) return match;
      return `<redacted:${r.kind}>`;
    });
  }
  return out;
}

export interface SanitizationReport {
  redactedKinds: string[];
  output: string;
}

export function sanitizeWithReport(input: string): SanitizationReport {
  const kinds = new Set<string>();
  let out = input;
  for (const r of RULES) {
    out = out.replace(r.re, (match) => {
      if (r.validate && !r.validate(match)) return match;
      kinds.add(r.kind);
      return `<redacted:${r.kind}>`;
    });
  }
  return { redactedKinds: [...kinds], output: out };
}
