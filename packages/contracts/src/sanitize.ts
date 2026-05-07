/**
 * Sanitizer hook. Phase 11 hardens this with a real PII redaction pipeline
 * (email/phone/api_key/bearer_token/credit_card/id_number per requirement
 * §10.1 acceptance 45). For Phase 0–3 this is identity. Every repository write
 * that persists transcript / event text / failure reasons / team messages /
 * work item descriptions / summaries MUST route the text through this
 * function, so that turning it on later is a single-edit operation.
 */
export function sanitizeText(input: string): string {
  // TODO(phase-11): apply redaction regex set; emit `lastFailureReason_redacted`
  // and `lastFailureReason_redaction_failed` events for callers that need them.
  return input;
}
