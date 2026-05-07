/**
 * Unit tests for `classifyToolError` covering all four failure classes
 * surfaced through the executor: transient_error, assertion_error,
 * permission_error, user_cancelled.
 */
import { describe, it, expect } from 'vitest';

import { classifyToolError } from '../executor.js';

describe('classifyToolError', () => {
  describe('user_cancelled (checked first to preempt other branches)', () => {
    it('detects "user cancelled by signal"', () => {
      expect(classifyToolError('user cancelled by signal')).toBe('user_cancelled');
    });
    it('detects bare SIGINT', () => {
      expect(classifyToolError('SIGINT received during tool dispatch')).toBe('user_cancelled');
    });
    it('detects "aborted by user"', () => {
      expect(classifyToolError('aborted by user before completion')).toBe('user_cancelled');
    });
    it('detects "aborted by operator"', () => {
      expect(classifyToolError('aborted by operator at 2026-05-07T09:14:00Z')).toBe(
        'user_cancelled',
      );
    });
    it('detects "manually stopped"', () => {
      expect(classifyToolError('manually stopped by user from UI')).toBe('user_cancelled');
    });
    it('detects "client cancelled"', () => {
      expect(classifyToolError('client cancelled the request')).toBe('user_cancelled');
    });
    it('detects "/cancel issued by"', () => {
      expect(classifyToolError('POST /tasks/t_001/cancel issued by user u_7')).toBe(
        'user_cancelled',
      );
    });
    it('detects "user_cancelled" snake_case token', () => {
      expect(classifyToolError('user_cancelled flag set on task t_88c')).toBe('user_cancelled');
    });
  });

  describe('transient_error', () => {
    it('detects ETIMEDOUT', () => {
      expect(classifyToolError('ETIMEDOUT connecting to api.example.com')).toBe(
        'transient_error',
      );
    });
    it('detects ECONNRESET', () => {
      expect(classifyToolError('ECONNRESET while reading body')).toBe('transient_error');
    });
    it('detects HTTP 503', () => {
      expect(classifyToolError('HTTP 503 Service Unavailable')).toBe('transient_error');
    });
    it('detects rate limited 429', () => {
      expect(classifyToolError('429 Too Many Requests, retry-after 30s')).toBe(
        'transient_error',
      );
    });
  });

  describe('permission_error', () => {
    it('detects EACCES', () => {
      expect(classifyToolError('EACCES: permission denied, open /etc/shadow')).toBe(
        'permission_error',
      );
    });
    it('detects 403 Forbidden', () => {
      expect(classifyToolError('403 Forbidden by IAM policy')).toBe('permission_error');
    });
    it('detects token expired', () => {
      expect(classifyToolError('token expired at 2026-05-07')).toBe('permission_error');
    });
    it('detects sandbox path traversal', () => {
      expect(classifyToolError('denied by sandbox: path traversal blocked')).toBe(
        'permission_error',
      );
    });
  });

  describe('assertion_error (default)', () => {
    it('detects expect mismatch', () => {
      expect(classifyToolError('AssertionError: expected 5 to equal 7')).toBe(
        'assertion_error',
      );
    });
    it('detects ZodError', () => {
      expect(classifyToolError('ZodError: invalid_type at path body.userId')).toBe(
        'assertion_error',
      );
    });
    it('detects invariant violation', () => {
      expect(classifyToolError('invariant violated: snapshot ordering')).toBe(
        'assertion_error',
      );
    });
    it('detects schema mismatch', () => {
      expect(classifyToolError('JSON schema mismatch at /payload/items/0')).toBe(
        'assertion_error',
      );
    });
  });
});
