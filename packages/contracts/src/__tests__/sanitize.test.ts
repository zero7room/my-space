import { describe, it, expect } from 'vitest';

import { sanitizeText, sanitizeWithReport } from '../sanitize.js';

describe('sanitizeText', () => {
  it('redacts emails', () => {
    expect(sanitizeText('contact me at alice@example.com please')).toContain(
      '<redacted:email>',
    );
  });

  it('redacts phone numbers', () => {
    const out = sanitizeText('call +1 415 555 0100 today');
    expect(out).toContain('<redacted:phone>');
    expect(out).not.toContain('415 555 0100');
  });

  it('redacts bearer tokens', () => {
    expect(sanitizeText('Authorization: Bearer abc123def456ghi')).toContain(
      '<redacted:bearer_token>',
    );
  });

  it('redacts api keys', () => {
    expect(
      sanitizeText('use key_demo_abcdefghijklmnop'),
    ).toContain('<redacted:api_key>');
  });

  it('redacts valid Luhn credit card', () => {
    // 4111111111111111 is a famous test Luhn-valid card.
    expect(sanitizeText('card 4111 1111 1111 1111')).toContain(
      '<redacted:credit_card>',
    );
  });

  it('does not redact invalid Luhn 16-digit run', () => {
    expect(sanitizeText('id 1234123412341234')).not.toContain('redacted');
  });

  it('redacts SSN format', () => {
    expect(sanitizeText('SSN 123-45-6789')).toContain('<redacted:ssn>');
  });

  it('reports all redacted kinds', () => {
    const r = sanitizeWithReport(
      'email a@b.com phone +1 415 555 0100 token Bearer xxxxxxxxxx',
    );
    expect(new Set(r.redactedKinds)).toEqual(
      new Set(['email', 'phone', 'bearer_token']),
    );
  });

  it('passes through clean text unchanged', () => {
    const t = 'just a normal sentence with no PII';
    expect(sanitizeText(t)).toBe(t);
  });
});
