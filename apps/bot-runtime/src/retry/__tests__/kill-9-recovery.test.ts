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
import { RecoveryScanner } from '../../runtime/recovery.js';
import { RetryScheduler } from '../scheduler.js';

/**
 * Simulates the kill-9 retry recovery scenario (requirement §10.1 #37):
 *   1. A task fails with transient_error.
 *   2. RetryScheduler writes `task_retry_scheduled` + updates task.retry.
 *   3. Process is "killed" before the task status actually transitions.
 *   4. Recovery scan runs; it must NOT auto-requeue (leave failed, respect the
 *      retry scheduler's next tick).
 *   5. On the next tick with nextRetryAt past, the scheduler auto-requeues.
 */
describe('kill-9 retry recovery', () => {
  it('recovery does not back-fill failed→queued; next scheduler tick does', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'k9-'));
    const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-k9' });
    const now = '2026-05-07T00:00:00.000Z';
    const owner = newUserId();
    const threadId = newThreadId();
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 't',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: now,
      updatedAt: now,
    });
    const task: Task = {
      id: newTaskId(),
      threadId,
      ownerUserId: owner,
      title: 'x',
      description: '',
      status: 'failed',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      blockedReason: 'retry_pending',
      retry: {
        attemptCount: 0,
        maxRetries: 2,
        failureClass: 'transient_error',
        lastFailureAt: now,
        lastFailureReason: 'ETIMEDOUT',
      },
      createdAt: now,
      updatedAt: now,
    };
    await rt.tasks.create(task);

    // 2. Scheduler schedules retry (attemptCount 0 → 1, nextRetryAt set).
    const sched = new RetryScheduler(rt, () => Date.parse(now), () => 0.5);
    const decision = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'ETIMEDOUT',
    });
    expect(decision.outcome).toBe('scheduled');
    // Persist the decision as if master had written it.
    await rt.tasks.update({ ...task, retry: decision.retry });

    // 3. Simulate kill -9 by not transitioning the task. Recovery runs now.
    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    expect(r.staleRunningTasksBlocked).toBe(0);
    const afterRecovery = await rt.tasks.get(threadId, task.id);
    expect(afterRecovery?.status).toBe('failed');

    // 4. Advance clock past nextRetryAt; next tick auto-requeues.
    const future = Date.parse(decision.nextRetryAt!) + 1000;
    const sched2 = new RetryScheduler(rt, () => future, () => 0.5);
    const requeued = await sched2.tickForThread(threadId);
    expect(requeued.length).toBe(1);
    expect(requeued[0]?.status).toBe('queued');
    const events = await rt.tasks.readEventsSince(threadId, task.id);
    expect(events.some((e) => e.kind === 'task_retry_started')).toBe(true);
  });

  it('user cancel after the failure blocks the auto-retry tick', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'k9-'));
    const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-k9b' });
    const now = '2026-05-07T00:00:00.000Z';
    const owner = newUserId();
    const threadId = newThreadId();
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 't',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: now,
      updatedAt: now,
    });
    const task: Task = {
      id: newTaskId(),
      threadId,
      ownerUserId: owner,
      title: 'x',
      description: '',
      status: 'failed',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      blockedReason: 'retry_pending',
      retry: {
        attemptCount: 1,
        maxRetries: 2,
        failureClass: 'transient_error',
        lastFailureAt: '2026-05-07T00:00:00.000Z',
        nextRetryAt: '2026-05-07T00:00:10.000Z',
      },
      lastUserSignalAt: '2026-05-07T00:00:05.000Z',
      lastUserSignalKind: 'cancel',
      createdAt: now,
      updatedAt: now,
    };
    await rt.tasks.create(task);
    const sched = new RetryScheduler(
      rt,
      () => Date.parse('2026-05-07T00:00:20.000Z'),
    );
    const out = await sched.tickForThread(threadId);
    expect(out).toHaveLength(0);
    const events = await rt.tasks.readEventsSince(threadId, task.id);
    const exhausted = events.find((e) => e.kind === 'task_retry_exhausted');
    expect(exhausted?.payload['reason']).toBe('user_cancel_supersedes');
  });
});
