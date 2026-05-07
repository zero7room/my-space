import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newTaskListId,
  newThreadId,
  newUserId,
  type Task,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { NotifyThrottle, RetryScheduler } from '../index.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'retry-')),
    runtimeId: 'rt-retry',
  });
}

const NOW = '2026-05-07T00:00:00.000Z';

async function seed(rt: RuntimePaths, status: Task['status'] = 'failed', maxRetries = 2, attemptCount = 0): Promise<{ task: Task; threadId: string }> {
  const owner = newUserId();
  const threadId = newThreadId();
  await rt.threads.create({
    id: threadId,
    ownerUserId: owner,
    title: 't',
    status: 'idle',
    taskListId: newTaskListId(),
    channelBindingIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  const task: Task = {
    id: newTaskId(),
    threadId,
    ownerUserId: owner,
    title: 't',
    description: '',
    status,
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 2,
    retry: { attemptCount, maxRetries, failureClass: 'transient_error' },
    blockedReason: status === 'failed' || status === 'blocked' ? 'retry_pending' : undefined,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await rt.tasks.create(task);
  return { task, threadId };
}

describe('RetryScheduler', () => {
  it('schedules transient with exponential backoff', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt);
    const sched = new RetryScheduler(rt, () => Date.parse(NOW), () => 0.5);
    const r = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'timeout',
    });
    expect(r.outcome).toBe('scheduled');
    expect(r.retry.attemptCount).toBe(1);
    expect(r.nextRetryAt).toBeDefined();
  });

  it('marks exhausted when attemptCount >= maxRetries', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt, 'failed', 2, 2);
    const sched = new RetryScheduler(rt);
    const r = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'still failing',
    });
    expect(r.outcome).toBe('exhausted');
  });

  it('does not retry assertion_error / permission_error / user_cancelled / budget_overflow', async () => {
    const rt = mkrt();
    for (const cls of ['assertion_error', 'permission_error', 'user_cancelled', 'budget_overflow'] as const) {
      const { task, threadId } = await seed(rt);
      const sched = new RetryScheduler(rt);
      const r = await sched.schedule({
        threadId,
        task,
        failureClass: cls,
        failureReason: 'why',
      });
      expect(r.outcome).toBe('not_eligible');
    }
  });

  it('refuses team-internal tasks', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt);
    const sched = new RetryScheduler(rt);
    const r = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'x',
      isTeamInternal: true,
    });
    expect(r.outcome).toBe('not_eligible');
  });

  it('tickForThread auto-requeues failed tasks past nextRetryAt', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt);
    const sched = new RetryScheduler(rt, () => Date.parse(NOW), () => 0.5);
    const decision = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'timeout',
    });
    // Persist the decision into the task.
    await rt.tasks.update({ ...task, retry: decision.retry });
    // Advance clock past nextRetryAt and tick.
    const future = Date.parse(decision.nextRetryAt!) + 1000;
    const sched2 = new RetryScheduler(rt, () => future, () => 0.5);
    const out = await sched2.tickForThread(threadId);
    expect(out.length).toBe(1);
    expect(out[0]?.status).toBe('queued');
  });
});

describe('NotifyThrottle', () => {
  it('allows up to capacity then drops', () => {
    let now = 0;
    const t = new NotifyThrottle({ capacity: 3, refillPerSec: 0, now: () => now });
    expect(t.consume('feishu', 'oc_x')).toBe(true);
    expect(t.consume('feishu', 'oc_x')).toBe(true);
    expect(t.consume('feishu', 'oc_x')).toBe(true);
    expect(t.consume('feishu', 'oc_x')).toBe(false);
    expect(t.consume('feishu', 'oc_y')).toBe(true);
  });

  it('refills over time', () => {
    let now = 0;
    const t = new NotifyThrottle({ capacity: 1, refillPerSec: 1, now: () => now });
    expect(t.consume('feishu', 'oc')).toBe(true);
    expect(t.consume('feishu', 'oc')).toBe(false);
    now = 1500;
    expect(t.consume('feishu', 'oc')).toBe(true);
  });

  it('isolates per (taskId, kind) composite', () => {
    let now = 0;
    const t = new NotifyThrottle({ capacity: 1, refillPerSec: 0, now: () => now });
    const base = { provider: 'feishu', externalId: 'oc_x' } as const;
    expect(
      t.consume({ ...base, taskId: 'ta_1', notificationKind: 'task_failed' }),
    ).toBe(true);
    // Same conversation, different kind → separate bucket.
    expect(
      t.consume({ ...base, taskId: 'ta_1', notificationKind: 'task_retry_started' }),
    ).toBe(true);
    // Repeat exact composite → drop.
    expect(
      t.consume({ ...base, taskId: 'ta_1', notificationKind: 'task_failed' }),
    ).toBe(false);
  });

  it('reset lets a manual retry break the window', () => {
    let now = 0;
    const t = new NotifyThrottle({ capacity: 1, refillPerSec: 0, now: () => now });
    const key = {
      provider: 'feishu',
      externalId: 'oc_x',
      taskId: 'ta_1',
      notificationKind: 'task_failed',
    } as const;
    expect(t.consume(key)).toBe(true);
    expect(t.consume(key)).toBe(false);
    t.reset(key);
    expect(t.consume(key)).toBe(true);
  });

  it('global per-provider cap bounds overall rate', () => {
    let now = 0;
    const t = new NotifyThrottle({
      capacity: 1_000,
      refillPerSec: 1_000,
      globalPerProviderRpm: 2,
      now: () => now,
    });
    expect(t.consume({ provider: 'feishu', externalId: 'a' })).toBe(true);
    expect(t.consume({ provider: 'feishu', externalId: 'b' })).toBe(true);
    expect(t.consume({ provider: 'feishu', externalId: 'c' })).toBe(false);
    // Slack isolated.
    expect(t.consume({ provider: 'slack', externalId: 'x' })).toBe(true);
  });
});
