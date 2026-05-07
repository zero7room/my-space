import { describe, it, expect } from 'vitest';

import {
  ID_PREFIXES,
  RUNTIME_ID_REGEX,
  idPrefix,
  isId,
  isValidRuntimeId,
  newTaskId,
  newRuntimeId,
} from '../ids.js';

describe('ids', () => {
  it('formats new ids as <prefix>_<21 chars>', () => {
    const id = newTaskId();
    expect(id.startsWith(`${ID_PREFIXES.task}_`)).toBe(true);
    expect(id).toMatch(/^ta_[A-Za-z0-9]{21}$/);
  });

  it('idPrefix returns the prefix or null', () => {
    expect(idPrefix(newTaskId())).toBe('ta');
    expect(idPrefix('not-an-id')).toBeNull();
  });

  it('isId narrows by prefix when supplied', () => {
    const taskId = newTaskId();
    expect(isId(taskId, 'task')).toBe(true);
    expect(isId(taskId, 'thread')).toBe(false);
    expect(isId('garbage', 'task')).toBe(false);
    expect(isId(42 as unknown)).toBe(false);
  });

  it('runtimeId validator enforces lowercase + digits + dashes', () => {
    expect(isValidRuntimeId('default')).toBe(true);
    expect(isValidRuntimeId('rt-01')).toBe(true);
    expect(isValidRuntimeId('Rt')).toBe(false);
    expect(isValidRuntimeId('-rt')).toBe(false);
    // Anchored regex must reject overflow.
    expect(RUNTIME_ID_REGEX.test('a'.repeat(64))).toBe(false);
  });

  it('newRuntimeId is non-empty (sanity)', () => {
    expect(newRuntimeId().length).toBeGreaterThan(3);
  });
});
