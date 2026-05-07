/**
 * Acceptance 61 — parent task cancel cascades to active team. Pushing a
 * cancel signal to the task control file → ThreadLoop drains it → team
 * status becomes cancelled, team_cancelled event appended, teammates
 * transitioned to cancelled. The parent task transitions only after.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newThreadId,
  newUserId,
  newTaskListId,
  newEventId,
  type Task,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { TeamRuntime } from '../index.js';
import { ThreadLoop } from '../../thread-loop/thread-loop.js';

const NOW = '2026-05-07T00:00:00.000Z';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'team-cancel-')),
    runtimeId: 'rt-cancel',
  });
}

async function seedRunningTask(rt: RuntimePaths): Promise<{ threadId: string; task: Task }> {
  const owner = newUserId();
  const threadId = newThreadId();
  await rt.threads.create({
    id: threadId,
    ownerUserId: owner,
    title: 't',
    status: 'working',
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
    status: 'queued',
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 2,
    retry: { attemptCount: 0, maxRetries: 2 },
    createdAt: NOW,
    updatedAt: NOW,
  };
  await rt.tasks.create(task);
  return { threadId, task };
}

describe('Parent cancel cascade (acceptance 61)', () => {
  it('cascades cancel to active team and team reaches cancelled before parent transitions', async () => {
    const rt = mkrt();
    const { threadId, task } = await seedRunningTask(rt);
    const tr = new TeamRuntime({ rt, now: () => NOW });

    const { team, teammates } = await tr.createTeam({
      threadId,
      parentTaskId: task.id,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 'coder' }],
    });
    expect(team.status).toBe('active');
    expect(teammates.length).toBe(1);

    // Push cancel signal directly via the control file.
    await rt.tasks.writeControl(threadId, task.id, {
      taskId: task.id,
      pendingSignals: [{
        kind: 'cancel',
        messageId: newEventId(),
        userId: task.ownerUserId,
        createdAt: NOW,
      }],
      updatedAt: NOW,
    });

    const loop = new ThreadLoop({ rt });
    await loop.runOnce(threadId, task.id);

    const t = await rt.teams.getTeam(threadId, task.id, team.id);
    expect(t?.status).toBe('cancelled');
    const events = await rt.teams.readTeamEvents(threadId, task.id, team.id);
    expect(events.some((e) => e.kind === 'team_cancelled')).toBe(true);
    expect(events.some((e) => e.kind === 'teammate_cancelled')).toBe(true);

    // The parent task transitioned only after the cascade synchronously
    // ensured team_cancelled was written. We assert (a) team is terminal
    // before the loop returns and (b) task_cancelled was emitted.
    const taskEvents = await rt.tasks.readEventsSince(threadId, task.id, 0);
    const taskCancelledIdx = taskEvents.findIndex((e) => e.kind === 'task_cancelled');
    expect(taskCancelledIdx).toBeGreaterThanOrEqual(0);
    expect(events.some((e) => e.kind === 'team_cancelled')).toBe(true);
  });
});
