import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newOutboundJobId,
  newPlanId,
  newPlanRevisionId,
  newTaskId,
  newTaskListId,
  newTeamId,
  newThreadId,
  newUserId,
  type Task,
  type Thread,
  type ChannelJob,
  type Team,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../paths.js';
import { RecoveryScanner } from '../recovery.js';

function mkrt(): RuntimePaths {
  const ws = mkdtempSync(path.join(tmpdir(), 'rt-recover-'));
  return new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-recover' });
}

const NOW = '2026-05-07T00:00:00.000Z';

describe('RecoveryScanner', () => {
  it('migrates v1 task to v2 and emits transition event', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    // Hand-write a v1 task by passing schemaVersion as 1 — repo accepts both.
    const v1: Task = {
      id: taskId,
      threadId,
      ownerUserId: newUserId(),
      title: 't',
      description: '',
      status: 'queued',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.tasks.create(v1);

    const scanner = new RecoveryScanner({ paths: rt.paths });
    const r = await scanner.run();
    expect(r.tasksMigrated).toBe(1);
    const got = await rt.tasks.get(threadId, taskId);
    expect(got?.schemaVersion).toBe(2);
    expect(got?.retry).toEqual({ attemptCount: 0, maxRetries: 2 });
    expect(r.events.some((e) => e.kind === 'task_schema_migrated')).toBe(true);
  });

  it('blocks running tasks with non_idempotent_tool_in_flight', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    const t: Task = {
      id: taskId,
      threadId,
      ownerUserId: newUserId(),
      confirmedByUserId: undefined,
      title: 'r',
      description: '',
      status: 'running',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.tasks.create(t);
    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    expect(r.staleRunningTasksBlocked).toBe(1);
    const got = await rt.tasks.get(threadId, taskId);
    expect(got?.status).toBe('blocked');
    expect(got?.blockedReason).toBe('non_idempotent_tool_in_flight');
  });

  it('repairs TaskList drift and emits task_list_repair', async () => {
    const rt = mkrt();
    const ownerUserId = newUserId();
    const threadId = newThreadId();
    const thread: Thread = {
      id: threadId,
      ownerUserId,
      title: '',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.threads.create(thread);
    const taskA = newTaskId();
    const taskB = newTaskId();
    // Confirmed tasks should be in the list.
    await rt.tasks.create({
      id: taskA,
      threadId,
      ownerUserId,
      confirmedByUserId: ownerUserId,
      title: 'a',
      description: '',
      status: 'completed',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: '2026-05-07T00:00:00.000Z',
      updatedAt: NOW,
    });
    await rt.tasks.create({
      id: taskB,
      threadId,
      ownerUserId,
      confirmedByUserId: ownerUserId,
      title: 'b',
      description: '',
      status: 'queued',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: '2026-05-07T00:00:01.000Z',
      updatedAt: NOW,
    });
    // Persist a wrong task list to force repair.
    await rt.taskLists.save({
      id: newTaskListId(),
      threadId,
      orderedTaskIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    expect(r.taskListsRepaired).toBe(1);
    expect(r.events.some((e) => e.kind === 'task_list_repair')).toBe(true);
    const list = await rt.taskLists.load(threadId);
    expect(list?.orderedTaskIds).toEqual([taskA, taskB]);
  });

  it('requeues locked outbound jobs', async () => {
    const rt = mkrt();
    const j: ChannelJob = {
      id: newOutboundJobId(),
      provider: 'feishu',
      type: 'send_message',
      status: 'running',
      payload: {},
      attemptCount: 0,
      runAfter: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.channelJobs.create(j);
    await rt.channelJobs.move(j, 'pending', 'locked');
    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    expect(r.jobsRequeued).toBe(1);
    expect((await rt.channelJobs.list('pending')).length).toBe(1);
    expect((await rt.channelJobs.list('locked')).length).toBe(0);
  });

  it('cancels forming team without teammates and fails finishing team without summary', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const taskId = newTaskId();
    const teamId = newTeamId();
    const teamId2 = newTeamId();
    const baseTeam: Team = {
      id: teamId,
      parentTaskId: taskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      threadId,
      status: 'forming',
      roster: [],
      budget: {
        maxDurationMs: 60_000,
        maxTokens: 100,
        maxTeammates: 4,
        maxWorkItems: 8,
        maxMessages: 64,
      },
      schemaVersion: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.teams.saveTeam(baseTeam);
    await rt.teams.saveTeam({ ...baseTeam, id: teamId2, status: 'finishing' });

    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    expect(r.teamsCancelled).toBe(1);
    expect(r.teamsFailed).toBe(1);
  });

  it('writes diagnostics jsonl', async () => {
    const rt = mkrt();
    await new RecoveryScanner({ paths: rt.paths }).run();
    const fs = await import('node:fs/promises');
    const log = path.join(rt.paths.diagnosticsRoot(), 'recovery.jsonl');
    const exists = await fs.stat(log).then(
      () => true,
      () => false,
    );
    expect(exists).toBe(true);
  });

  it('flags artifact sha256 mismatch as a warning', async () => {
    const rt = mkrt();
    const owner = newUserId();
    const threadId = newThreadId();
    const taskId = newTaskId();
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: '',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await rt.tasks.create({
      id: taskId,
      threadId,
      ownerUserId: owner,
      title: 't',
      description: '',
      status: 'completed',
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    // Write an artifact file on disk, record a different sha256.
    const fsNode = await import('node:fs/promises');
    await fsNode.mkdir(rt.paths.taskOutputs(threadId, taskId), { recursive: true });
    const artFilePath = path.join(
      rt.paths.taskOutputs(threadId, taskId),
      'a.txt',
    );
    await fsNode.writeFile(artFilePath, 'actual content');
    await rt.artifacts.save(threadId, {
      id: 'ar_aaaaaaaaaaaaaaaaaaaaa',
      taskId,
      planRevisionId: 'pr_aaaaaaaaaaaaaaaaaaaaa',
      relativePath: 'outputs/a.txt',
      sizeBytes: 14,
      mimeType: 'text/plain',
      sha256: 'b'.repeat(64),
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const r = await new RecoveryScanner({ paths: rt.paths }).run();
    expect(r.artifactWarnings).toBeGreaterThanOrEqual(1);
  });
});

// silence unused imports
void newPlanId;
void newPlanRevisionId;
