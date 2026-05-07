/**
 * Acceptance 29 — task_retry_classification_warning emitted when 2 consecutive
 * transient_error retries have dissimilar (jaccard < 0.5) failure reasons.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { newTaskId, newThreadId, newUserId, newTaskListId } from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { RetryScheduler } from '../scheduler.js';
import { jaccardSimilarity } from '../jaccard.js';

describe('jaccardSimilarity', () => {
  it('returns 0 for empty inputs', () => {
    expect(jaccardSimilarity('', '')).toBe(0);
    expect(jaccardSimilarity('foo', '')).toBe(0);
  });
  it('returns 1 for identical token sets', () => {
    expect(jaccardSimilarity('hello world', 'world hello')).toBe(1);
  });
  it('returns < 0.5 for clearly different reasons', () => {
    expect(
      jaccardSimilarity(
        'connection reset by peer',
        'database constraint violation foreign key',
      ),
    ).toBeLessThan(0.5);
  });
});

describe('task_retry_classification_warning (acceptance 29)', () => {
  it('emits warning when 2 consecutive transient_error retries have <0.5 similarity', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'retry-classify-'));
    const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-classify' });
    const threadId = newThreadId();
    const ownerUserId = newUserId();
    const taskId = newTaskId();
    await rt.threads.create({
      id: threadId,
      ownerUserId,
      title: 't',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    });
    await rt.tasks.create({
      id: taskId,
      threadId,
      ownerUserId,
      title: 't',
      description: '',
      status: 'failed',
      blockedReason: 'retry_pending',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: '2026-05-07T00:00:00.000Z',
    });

    const sched = new RetryScheduler(rt, () => Date.parse('2026-05-07T00:00:00Z'));

    // Attempt #1 — primes lastFailureReason.
    const taskAfter1 = await rt.tasks.get(threadId, taskId);
    const r1 = await sched.schedule({
      threadId,
      task: taskAfter1!,
      failureClass: 'transient_error',
      failureReason: 'connection reset by peer',
    });
    expect(r1.outcome).toBe('scheduled');
    // Persist the updated retry state so the next call sees lastFailureReason.
    await rt.tasks.update({ ...taskAfter1!, retry: r1.retry });

    // Attempt #2 — dissimilar reason → warning.
    const taskAfter2 = await rt.tasks.get(threadId, taskId);
    await sched.schedule({
      threadId,
      task: taskAfter2!,
      failureClass: 'transient_error',
      failureReason: 'database constraint violation foreign key duplicate',
    });

    const events = await rt.tasks.readEventsSince(threadId, taskId);
    const warn = events.find((e) => e.kind === 'task_retry_classification_warning');
    expect(warn).toBeDefined();
    const p = warn!.payload as Record<string, unknown>;
    expect(p['hint']).toBe('consider_assertion_error');
    expect((p['similarity'] as number) < 0.5).toBe(true);
  });
});
