import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  applyTaskTransition,
  newTaskId,
  newTaskListId,
  newThreadId,
  newUserId,
  type Task,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { markThreadChattingIfDone } from '../thread-state.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'thread-state-')),
    runtimeId: 'rt-ts',
  });
}

const NOW = '2026-05-07T00:00:00.000Z';

async function seed(rt: RuntimePaths, status: Task['status']): Promise<{ task: Task; threadId: string }> {
  const owner = newUserId();
  const threadId = newThreadId();
  const taskId = newTaskId();
  await rt.threads.create({
    id: threadId,
    ownerUserId: owner,
    title: 't',
    status: 'working',
    activeTaskId: taskId,
    taskListId: newTaskListId(),
    channelBindingIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  const task: Task = {
    id: taskId,
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
    createdAt: NOW,
    updatedAt: NOW,
  };
  await rt.tasks.create(task);
  return { task, threadId };
}

describe('markThreadChattingIfDone', () => {
  it('flips thread to chatting on completed', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt, 'queued');
    const completed = applyTaskTransition(task, 'running', { now: NOW });
    const done = applyTaskTransition(completed, 'completed', { now: NOW });
    await rt.tasks.update(done);
    const next = await markThreadChattingIfDone(rt, threadId, done, undefined, () => NOW);
    expect(next?.status).toBe('chatting');
    expect(next?.activeTaskId).toBeUndefined();
    const thread = await rt.threads.get(threadId);
    expect(thread?.status).toBe('chatting');
  });

  it('is a no-op when task is not terminal', async () => {
    const rt = mkrt();
    const { task, threadId } = await seed(rt, 'queued');
    const next = await markThreadChattingIfDone(rt, threadId, task, undefined, () => NOW);
    expect(next).toBeUndefined();
    const thread = await rt.threads.get(threadId);
    expect(thread?.activeTaskId).toBe(task.id);
  });
});
