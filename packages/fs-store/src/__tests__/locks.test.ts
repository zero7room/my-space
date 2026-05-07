import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  acquireInstanceLock,
  readInstanceLock,
  refreshInstanceLock,
  releaseInstanceLock,
  LockNotAcquiredError,
  LeaseManager,
} from '../index.js';

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'fs-store-locks-'));
}

describe('Instance lock', () => {
  it('acquires when absent and refuses when held by other live process', async () => {
    const dir = tmp();
    const lock = path.join(dir, '.lock');
    const a = await acquireInstanceLock({
      lockPath: lock,
      runtimeId: 'rt-a',
      leaseMs: 60_000,
      pid: 100,
    });
    expect(a.runtimeId).toBe('rt-a');

    await expect(
      acquireInstanceLock({
        lockPath: lock,
        runtimeId: 'rt-b',
        leaseMs: 60_000,
        pid: 200,
      }),
    ).rejects.toBeInstanceOf(LockNotAcquiredError);
  });

  it('reclaims a stale lock by renaming to *.stale.<token>', async () => {
    const dir = tmp();
    const lock = path.join(dir, '.lock');
    let clock = 1_000_000;
    await acquireInstanceLock({
      lockPath: lock,
      runtimeId: 'rt-a',
      leaseMs: 100,
      pid: 100,
      now: () => clock,
    });
    clock += 1_000_000;
    const taken = await acquireInstanceLock({
      lockPath: lock,
      runtimeId: 'rt-b',
      leaseMs: 60_000,
      pid: 200,
      now: () => clock,
    });
    expect(taken.runtimeId).toBe('rt-b');
    const { existsSync } = await import('node:fs');
    const { readdirSync } = await import('node:fs');
    const files = readdirSync(dir);
    expect(files.some((f) => /\.lock\.stale\./.test(f))).toBe(true);
    expect(existsSync(lock)).toBe(true);
  });

  it('refresh updates leaseExpireAt', async () => {
    const dir = tmp();
    const lock = path.join(dir, '.lock');
    let clock = 1_000_000;
    await acquireInstanceLock({
      lockPath: lock,
      runtimeId: 'rt-a',
      leaseMs: 60_000,
      pid: 100,
      now: () => clock,
    });
    clock += 5000;
    await refreshInstanceLock(lock, 60_000, () => clock);
    const after = await readInstanceLock(lock);
    expect(after && Date.parse(after.leaseExpireAt)).toBe(clock + 60_000);
  });

  it('release unlinks the lock', async () => {
    const dir = tmp();
    const lock = path.join(dir, '.lock');
    await acquireInstanceLock({
      lockPath: lock,
      runtimeId: 'rt-a',
      leaseMs: 60_000,
      pid: 100,
    });
    await releaseInstanceLock(lock);
    expect(await readInstanceLock(lock)).toBeUndefined();
  });
});

describe('LeaseManager', () => {
  it('acquire / refresh / release / expireStale', () => {
    let now = 1000;
    const m = new LeaseManager(() => now);
    const a = m.acquire('resource-a', 'holder-1', 100);
    expect(a).toBeDefined();
    const b = m.acquire('resource-a', 'holder-2', 100);
    expect(b).toBeUndefined();
    now += 50;
    expect(m.refresh(a!, 100)).toBe(true);
    now += 1000;
    expect(m.expireStale()).toBe(1);
    const c = m.acquire('resource-a', 'holder-2', 100);
    expect(c).toBeDefined();
    m.release(c!);
    expect(m.acquire('resource-a', 'holder-3', 100)).toBeDefined();
  });
});
