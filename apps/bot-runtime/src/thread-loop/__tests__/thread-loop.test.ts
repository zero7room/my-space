import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newPlanId,
  newPlanRevisionId,
  newTaskId,
  newTaskListId,
  newThreadId,
  newUserId,
  type Task,
  type TaskControl,
  type Plan,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import {
  PlanRevisionService,
  TaskDraftService,
  ThreadLoop,
} from '../index.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'tl-')),
    runtimeId: 'rt-tl',
  });
}

const NOW = '2026-05-07T00:00:00.000Z';

async function seedTask(rt: RuntimePaths, ownerUserId: string, status: Task['status'] = 'queued'): Promise<{ task: Task; threadId: string }> {
  const threadId = newThreadId();
  const taskId = newTaskId();
  await rt.threads.create({
    id: threadId,
    ownerUserId,
    title: 'th',
    status: 'idle',
    taskListId: newTaskListId(),
    channelBindingIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  const task: Task = {
    id: taskId,
    threadId,
    ownerUserId,
    title: 't',
    description: '',
    status,
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 2,
    retry: { attemptCount: 1, maxRetries: 2 },
    createdAt: NOW,
    updatedAt: NOW,
    blockedReason: status === 'failed' || status === 'blocked' ? 'awaiting_user_action' : undefined,
  };
  await rt.tasks.create(task);
  return { task, threadId };
}

async function pushSig(rt: RuntimePaths, threadId: string, taskId: string, sig: TaskControl['pendingSignals'][number]): Promise<void> {
  const cur = (await rt.tasks.readControl(threadId, taskId)) ?? {
    taskId,
    pendingSignals: [],
    updatedAt: NOW,
  };
  cur.pendingSignals.push(sig);
  cur.updatedAt = NOW;
  await rt.tasks.writeControl(threadId, taskId, cur);
}

describe('ThreadLoop drains pending signals', () => {
  it('cancel transitions queued → cancelled and emits task_cancelled', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const { task, threadId } = await seedTask(rt, owner, 'queued');
    await pushSig(rt, threadId, task.id, {
      kind: 'cancel',
      messageId: 'ms_aaaaaaaaaaaaaaaaaaaaa',
      userId: owner,
      createdAt: NOW,
    });
    const loop = new ThreadLoop({ rt, now: () => NOW });
    const events = await loop.runOnce(threadId, task.id);
    expect(events.length).toBe(1);
    const t = await rt.tasks.get(threadId, task.id);
    expect(t?.status).toBe('cancelled');
  });

  it('pause then resume returns task to queued', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const { task, threadId } = await seedTask(rt, owner, 'queued');
    const loop = new ThreadLoop({ rt, now: () => NOW });
    await pushSig(rt, threadId, task.id, { kind: 'pause', messageId: 'ms_aaaaaaaaaaaaaaaaaaaaa', userId: owner, createdAt: NOW });
    await loop.runOnce(threadId, task.id);
    expect((await rt.tasks.get(threadId, task.id))?.status).toBe('paused');

    await pushSig(rt, threadId, task.id, { kind: 'resume', messageId: 'ms_bbbbbbbbbbbbbbbbbbbbb', userId: owner, createdAt: NOW });
    await loop.runOnce(threadId, task.id);
    expect((await rt.tasks.get(threadId, task.id))?.status).toBe('queued');
  });

  it('manual_retry on failed resets retry counter and re-queues', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const { task, threadId } = await seedTask(rt, owner, 'failed');
    const loop = new ThreadLoop({ rt, now: () => NOW });
    await pushSig(rt, threadId, task.id, {
      kind: 'manual_retry',
      messageId: 'ms_aaaaaaaaaaaaaaaaaaaaa',
      userId: owner,
      createdAt: NOW,
    });
    await loop.runOnce(threadId, task.id);
    const t = await rt.tasks.get(threadId, task.id);
    expect(t?.status).toBe('queued');
    expect(t?.retry?.attemptCount).toBe(0);
  });
});

describe('TaskDraftService confirm/promote', () => {
  it('promotes draft to confirmed and appends to TaskList', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const threadId = newThreadId();
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 'th',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const svc = new TaskDraftService(rt);
    const draft = await svc.createDraftTask({
      threadId,
      ownerUserId: owner,
      title: 'do x',
      description: 'do x carefully',
      sourceMessageIds: [],
    });
    expect(draft.status).toBe('draft');
    const confirmed = await svc.confirmTask(threadId, draft.id, owner);
    expect(confirmed.status).toBe('confirmed');
    const list = await rt.taskLists.load(threadId);
    expect(list?.orderedTaskIds).toContain(draft.id);
  });

  it('rejects non-owner confirmation', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const intruder = newUserId();
    const threadId = newThreadId();
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 'th',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const svc = new TaskDraftService(rt);
    const draft = await svc.createDraftTask({
      threadId,
      ownerUserId: owner,
      title: 't',
      description: '',
      sourceMessageIds: [],
    });
    await expect(svc.confirmTask(threadId, draft.id, intruder)).rejects.toThrow(
      /owner mismatch/,
    );
  });
});

describe('PlanRevisionService', () => {
  it('archives artifacts, writes ChangeRecord + revision', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const { task, threadId } = await seedTask(rt, owner, 'queued');
    const planId = newPlanId();
    const oldRevId = newPlanRevisionId();
    const oldPlan: Plan = {
      id: planId,
      taskId: task.id,
      status: 'active',
      objective: 'old',
      steps: [],
      expectedArtifacts: [],
      revisionIds: [oldRevId],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.plans.save(threadId, oldPlan);
    await rt.planRevisions.save(threadId, {
      id: oldRevId,
      planId,
      taskId: task.id,
      status: 'active',
      fullPlan: oldPlan,
      reason: 'init',
      sourceMessageId: 'ms_aaaaaaaaaaaaaaaaaaaaa',
      archivedArtifactPaths: [],
      createdAt: NOW,
    });
    const artId = 'ar_aaaaaaaaaaaaaaaaaaaaa';
    await rt.artifacts.save(threadId, {
      id: artId,
      taskId: task.id,
      planRevisionId: oldRevId,
      relativePath: 'outputs/foo.txt',
      sizeBytes: 1,
      mimeType: 'text/plain',
      sha256: 'a'.repeat(64),
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const newPlan: Plan = {
      ...oldPlan,
      objective: 'new',
      revisionIds: [],
    };
    const svc = new PlanRevisionService(rt, undefined, () => NOW);
    const result = await svc.revise({
      threadId,
      task,
      oldPlanRevisionId: oldRevId,
      newPlan,
      reason: 'user changed scope',
      triggerMessageId: 'ms_bbbbbbbbbbbbbbbbbbbbb',
      triggerUserId: owner,
    });
    expect(result.revision.status).toBe('active');
    expect(result.task.activePlanRevisionId).toBe(result.revision.id);
    expect(result.changeRecord.archivedArtifactPaths.length).toBe(1);

    const arts = await rt.artifacts.list(threadId, task.id);
    expect(arts.find((a) => a.id === artId)?.status).toBe('archived');
  });

  it('resets retry state when task is failed', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const { task, threadId } = await seedTask(rt, owner, 'failed');
    const planId = newPlanId();
    const oldRevId = newPlanRevisionId();
    const oldPlan: Plan = {
      id: planId,
      taskId: task.id,
      status: 'active',
      objective: 'old',
      steps: [],
      expectedArtifacts: [],
      revisionIds: [oldRevId],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.plans.save(threadId, oldPlan);

    const svc = new PlanRevisionService(rt, undefined, () => NOW);
    const result = await svc.revise({
      threadId,
      task,
      oldPlanRevisionId: oldRevId,
      newPlan: { ...oldPlan, objective: 'changed' },
      reason: 'fix scope',
      triggerMessageId: 'ms_aaaaaaaaaaaaaaaaaaaaa',
      triggerUserId: owner,
    });
    expect(result.task.status).toBe('queued');
    expect(result.task.retry?.attemptCount).toBe(0);
  });
});
