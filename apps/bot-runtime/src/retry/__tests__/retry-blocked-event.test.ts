/**
 * Acceptance 32 — RetryScheduler must surface task_blocked events with the
 * appropriate blockedReason + suggestedActions when transitioning a task
 * into the retry_pending or retry_exhausted state.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import * as fs from 'node:fs/promises';
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
import { RetryScheduler } from '../index.js';

const NOW = '2026-05-07T00:00:00.000Z';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'retry-blocked-')),
    runtimeId: 'rt-retry-blocked',
  });
}

async function seed(
  rt: RuntimePaths,
  attemptCount: number,
  maxRetries = 2,
): Promise<{ task: Task; threadId: string }> {
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
    status: 'failed',
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 2,
    retry: { attemptCount, maxRetries, failureClass: 'transient_error' },
    blockedReason: 'retry_pending',
    createdAt: NOW,
    updatedAt: NOW,
  };
  await rt.tasks.create(task);
  return { task, threadId };
}

async function readEvents(
  rt: RuntimePaths,
  threadId: string,
  taskId: string,
): Promise<Array<Record<string, unknown>>> {
  const log = rt.paths.taskEventsLog(threadId, taskId);
  const raw = await fs.readFile(log, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter((l) => l.trim().length)
    .map((l) => JSON.parse(l));
}

describe('RetryScheduler — task_blocked emission (acceptance 32)', () => {
  it('emits task_blocked{retry_pending, suggestedActions:["cancel"]} on transient retry', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt, 0);
    const sched = new RetryScheduler(rt, () => Date.parse(NOW), () => 0.5);
    const r = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'timeout',
    });
    expect(r.outcome).toBe('scheduled');
    const evs = await readEvents(rt, threadId, task.id);
    const blocked = evs.find((e) => e['kind'] === 'task_blocked');
    expect(blocked).toBeDefined();
    const payload = blocked!['payload'] as Record<string, unknown>;
    expect(payload['blockedReason']).toBe('retry_pending');
    expect(payload['suggestedActions']).toEqual(['cancel']);
  });

  it('emits task_blocked{retry_exhausted, suggestedActions:["cancel"]} when retries exhausted', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt, 2, 2);
    const sched = new RetryScheduler(rt, () => Date.parse(NOW), () => 0.5);
    const r = await sched.schedule({
      threadId,
      task,
      failureClass: 'transient_error',
      failureReason: 'still failing',
    });
    expect(r.outcome).toBe('exhausted');
    const evs = await readEvents(rt, threadId, task.id);
    const blocked = evs.find((e) => e['kind'] === 'task_blocked');
    expect(blocked).toBeDefined();
    const payload = blocked!['payload'] as Record<string, unknown>;
    expect(payload['blockedReason']).toBe('retry_exhausted');
    expect(payload['suggestedActions']).toEqual(['cancel']);
  });
});
