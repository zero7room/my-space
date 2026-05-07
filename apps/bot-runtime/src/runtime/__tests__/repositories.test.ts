import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskListId,
  newThreadId,
  newTaskId,
  newUserId,
  newPlanId,
  newPlanRevisionId,
  newArtifactId,
  newBindingId,
  newOutboundJobId,
  type Task,
  type Thread,
  type Plan,
  type ArtifactRecord,
  type ChannelBinding,
  type ChannelJob,
  type ChatClaim,
} from '@ai-workflow/contracts';
import { ExclusiveCreateConflictError } from '@ai-workflow/fs-store';

import { RuntimePaths } from '../paths.js';

function mkrt(): RuntimePaths {
  const ws = mkdtempSync(path.join(tmpdir(), 'rt-repo-'));
  return new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-test' });
}

const NOW = '2026-05-07T00:00:00.000Z';

describe('UserRepository', () => {
  it('upserts and reads back', async () => {
    const rt = mkrt();
    const u = {
      id: newUserId(),
      displayName: 'Ada',
      channelIdentities: { email: 'ada@example.com' },
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.users.upsert(u);
    const read = await rt.users.get(u.id);
    expect(read?.displayName).toBe('Ada');
    expect((await rt.users.list()).length).toBe(1);
  });
});

describe('ThreadRepository + transcript + drafts', () => {
  it('creates, lists, appends transcript and reads it', async () => {
    const rt = mkrt();
    const tid = newThreadId();
    const t: Thread = {
      id: tid,
      ownerUserId: newUserId(),
      title: 'first',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.threads.create(t);
    expect((await rt.threads.list()).length).toBe(1);
    await rt.threads.appendTranscript(tid, {
      id: 'msg_1',
      threadId: tid,
      source: 'client',
      text: 'hello',
      at: NOW,
    });
    const txp = await rt.threads.readTranscript(tid);
    expect(txp.length).toBe(1);
    expect(txp[0]!.text).toBe('hello');

    await rt.threads.writeDraftTask(tid, { foo: 1 });
    expect(await rt.threads.readDraftTask(tid)).toEqual({ foo: 1 });
    await rt.threads.writeDraftTask(tid, undefined);
    expect(await rt.threads.readDraftTask(tid)).toBeUndefined();
  });
});

describe('TaskRepository + TaskList + events + control', () => {
  it('round-trips a task and event', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    const task: Task = {
      id: taskId,
      threadId,
      ownerUserId: newUserId(),
      title: 't',
      description: '',
      status: 'draft',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.tasks.create(task);
    const got = await rt.tasks.get(threadId, taskId);
    expect(got?.id).toBe(taskId);

    const ev = await rt.tasks.appendEvent(threadId, taskId, {
      kind: 'task_drafted',
      payload: { reason: 'init' },
      at: NOW,
      taskId,
      threadId,
    });
    expect(ev.seq).toBe(0);
    const tail = await rt.tasks.readEventsSince(threadId, taskId);
    expect(tail.length).toBe(1);

    await rt.tasks.writeControl(threadId, taskId, {
      taskId,
      pendingSignals: [],
      updatedAt: NOW,
    });
    const ctl = await rt.tasks.readControl(threadId, taskId);
    expect(ctl?.taskId).toBe(taskId);

    await rt.taskLists.save({
      id: newTaskListId(),
      threadId,
      orderedTaskIds: [taskId],
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect((await rt.taskLists.load(threadId))!.orderedTaskIds).toEqual([taskId]);
  });

  it('lists tasks by thread', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    for (let i = 0; i < 3; i++) {
      await rt.tasks.create({
        id: newTaskId(),
        threadId,
        ownerUserId: newUserId(),
        title: 't',
        description: '',
        status: 'draft',
        sourceMessageIds: [],
        artifactIds: [],
        changeRecordIds: [],
        archivedRevisionIds: [],
        schemaVersion: 2,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    expect((await rt.tasks.listForThread(threadId)).length).toBe(3);
  });
});

describe('Plan / PlanRevision / Artifact', () => {
  it('round-trips', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    const plan: Plan = {
      id: newPlanId(),
      taskId,
      status: 'draft',
      objective: 'do x',
      steps: [],
      expectedArtifacts: [],
      revisionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.plans.save(threadId, plan);
    expect((await rt.plans.get(threadId, taskId))!.id).toBe(plan.id);

    const rev = {
      id: newPlanRevisionId(),
      planId: plan.id,
      taskId,
      status: 'active' as const,
      fullPlan: plan,
      reason: 'init',
      sourceMessageId: 'ms_aaaaaaaaaaaaaaaaaaaaa',
      archivedArtifactPaths: [],
      createdAt: NOW,
    };
    await rt.planRevisions.save(threadId, rev);
    expect((await rt.planRevisions.list(threadId, taskId)).length).toBe(1);

    const art: ArtifactRecord = {
      id: newArtifactId(),
      taskId,
      planRevisionId: rev.id,
      relativePath: 'outputs/a.txt',
      sizeBytes: 1,
      mimeType: 'text/plain',
      sha256: 'a'.repeat(64),
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.artifacts.save(threadId, art);
    expect((await rt.artifacts.list(threadId, taskId)).length).toBe(1);
  });
});

describe('ChannelBindingRepository chat-claims uniqueness', () => {
  it('refuses second claim on same external id', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const provider = 'feishu';
    const externalId = 'oc_x';
    const claim: ChatClaim = {
      id: newBindingId(),
      provider,
      externalConversationId: externalId,
      threadId,
      bindingId: newBindingId(),
      createdAt: NOW,
    };
    await rt.channelBindings.claimExternalChat(claim);
    await expect(
      rt.channelBindings.claimExternalChat({ ...claim, threadId: newThreadId() }),
    ).rejects.toBeInstanceOf(ExclusiveCreateConflictError);
  });

  it('saves and lists bindings per thread', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const b: ChannelBinding = {
      id: newBindingId(),
      threadId,
      provider: 'feishu',
      externalConversationType: 'dm',
      status: 'bound',
      createdBy: 'client',
      enabled: true,
      notifyDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.channelBindings.save(b);
    expect((await rt.channelBindings.listForThread(threadId)).length).toBe(1);
  });
});

describe('ChannelJobRepository', () => {
  it('creates, moves, lists by bucket', async () => {
    const rt = mkrt();
    const j: ChannelJob = {
      id: newOutboundJobId(),
      provider: 'feishu',
      type: 'send_message',
      status: 'pending',
      payload: { text: 'hi' },
      attemptCount: 0,
      runAfter: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.channelJobs.create(j);
    expect((await rt.channelJobs.list('pending')).length).toBe(1);
    await rt.channelJobs.move(j, 'pending', 'locked');
    expect((await rt.channelJobs.list('pending')).length).toBe(0);
    expect((await rt.channelJobs.list('locked')).length).toBe(1);
  });
});
