import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  InstancePaths,
  PathOutsideRootError,
  appendEvent,
  readEventsSince,
  safeRelativePath,
  KeyedMutex,
} from '../index.js';

describe('InstancePaths layout', () => {
  const ip = new InstancePaths({ workspaceRoot: '/tmp/ws', runtimeId: 'rt-1' });
  it('builds canonical paths', () => {
    expect(ip.instanceRoot).toBe('/tmp/ws/data/instances/rt-1');
    expect(ip.lockFile).toBe('/tmp/ws/data/instances/rt-1/.lock');
    expect(ip.threadFile('th_x')).toBe(
      '/tmp/ws/data/instances/rt-1/state/threads/th_x/thread.json',
    );
    expect(ip.taskEventsLog('th_x', 'ta_y')).toBe(
      '/tmp/ws/data/instances/rt-1/state/threads/th_x/tasks/ta_y/events.jsonl',
    );
    expect(
      ip.teamWorkItemFile('th_x', 'ta_y', 'tm_z', 'completed', 'wi_q'),
    ).toBe(
      '/tmp/ws/data/instances/rt-1/state/threads/th_x/tasks/ta_y/teams/tm_z/work-items/completed/wi_q.json',
    );
  });
});

describe('safeRelativePath', () => {
  it('rejects paths that escape root', () => {
    expect(() => safeRelativePath('/a/b', '../c')).toThrow(PathOutsideRootError);
    expect(() => safeRelativePath('/a/b', '/etc/passwd')).toThrow(
      PathOutsideRootError,
    );
  });
  it('accepts inside-root paths', () => {
    expect(safeRelativePath('/a/b', 'c/d')).toBe('/a/b/c/d');
  });
});

describe('JSONL event log with monotonic seq', () => {
  it('assigns increasing seq starting at 0 and an id', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fs-store-jsonl-'));
    const log = path.join(dir, 'events.jsonl');
    const e1 = await appendEvent(log, { kind: 'task_started' });
    const e2 = await appendEvent(log, { kind: 'task_completed' });
    expect(e1.seq).toBe(0);
    expect(e2.seq).toBe(1);
    expect(e1.id).toMatch(/^ev_/);
    expect(e2.id).toMatch(/^ev_/);
    const all = await readEventsSince<{ kind: string; seq: number }>(log);
    expect(all.map((e) => e.seq)).toEqual([0, 1]);
    const tail = await readEventsSince<{ kind: string; seq: number }>(log, 1);
    expect(tail.map((e) => e.seq)).toEqual([1]);
  });
});

describe('KeyedMutex', () => {
  it('serializes per key', async () => {
    const m = new KeyedMutex();
    const order: string[] = [];
    await Promise.all([
      m.run('a', async () => {
        order.push('a-start');
        await new Promise((r) => setTimeout(r, 10));
        order.push('a-end');
      }),
      m.run('a', async () => {
        order.push('a2-start');
        order.push('a2-end');
      }),
      m.run('b', async () => {
        order.push('b-start');
        order.push('b-end');
      }),
    ]);
    // a's first lock fully runs before a2's; b runs independently.
    const idxAEnd = order.indexOf('a-end');
    const idxA2Start = order.indexOf('a2-start');
    expect(idxAEnd).toBeLessThan(idxA2Start);
  });
});
