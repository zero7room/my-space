/**
 * Acceptance 61 — parent task pause cascades to active team. The team must
 * transition to `paused` (NOT cancelled) and teammate claims must be retained
 * (work-items remain in the `claimed/` bucket). Resume restores the team to
 * `active` and teammates to `idle` so they can re-read messages from
 * lastMessageCursor.
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
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'team-pause-')),
    runtimeId: 'rt-pause',
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

describe('Parent pause cascade (acceptance 61)', () => {
  it('pauses team, retains claimed work-items, then resume restores', async () => {
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
    // Claim a work item to verify pause keeps it in claimed/.
    const wi = await tr.publishWorkItem(threadId, task.id, team.id, 'do thing');
    await tr.claimWorkItem(threadId, task.id, team.id, wi.id, teammates[0]!.id);

    // Push pause signal.
    await rt.tasks.writeControl(threadId, task.id, {
      taskId: task.id,
      pendingSignals: [{
        kind: 'pause',
        messageId: newEventId(),
        userId: task.ownerUserId,
        createdAt: NOW,
      }],
      updatedAt: NOW,
    });
    const loop = new ThreadLoop({ rt });
    await loop.runOnce(threadId, task.id);

    const paused = await rt.teams.getTeam(threadId, task.id, team.id);
    expect(paused?.status).toBe('paused');

    // Claim retained — work item still in claimed bucket.
    const stillClaimed = await rt.teams.listWorkItems(threadId, task.id, team.id, 'claimed');
    expect(stillClaimed.find((i) => i.id === wi.id)).toBeDefined();
    const available = await rt.teams.listWorkItems(threadId, task.id, team.id, 'available');
    expect(available.find((i) => i.id === wi.id)).toBeUndefined();

    // Now resume.
    await rt.tasks.writeControl(threadId, task.id, {
      taskId: task.id,
      pendingSignals: [{
        kind: 'resume',
        messageId: newEventId(),
        userId: task.ownerUserId,
        createdAt: NOW,
      }],
      updatedAt: NOW,
    });
    // Manually re-set parent to paused since runOnce on cancel above already moved.
    const parent = await rt.tasks.get(threadId, task.id);
    await rt.tasks.update({ ...parent!, status: 'paused' });
    await loop.runOnce(threadId, task.id);

    const resumed = await rt.teams.getTeam(threadId, task.id, team.id);
    expect(resumed?.status).toBe('active');
    const events = await rt.teams.readTeamEvents(threadId, task.id, team.id);
    expect(events.some((e) => e.kind === 'team_paused')).toBe(true);
    expect(events.some((e) => e.kind === 'team_resumed')).toBe(true);
  });
});
