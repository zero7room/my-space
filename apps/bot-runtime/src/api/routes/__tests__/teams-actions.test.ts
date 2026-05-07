/**
 * Acceptance 68 coverage for team-action endpoints.
 *   - POST /api/tasks/:taskId/teams/:teamId/cancel
 *   - POST /api/tasks/:taskId/teams/:teamId/teammates/:teammateId/approve
 *   - POST /api/tasks/:taskId/teams/:teamId/teammates/:teammateId/reject
 *
 * Verifies:
 *   - non-owner → 403 + task_action_denied{requestedAction, reason:"not_owner"}
 *   - terminal team on cancel → 409 + task_action_denied{reason:"terminal_state"}
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  newTaskId,
  newTaskListId,
  newTeamId,
  newTeammateId,
  newThreadId,
  newUserId,
  newWorkItemId,
  type Task,
  type Team,
  type Teammate,
} from '@ai-workflow/contracts';

import { createServer } from '../../server.js';

const NOW = '2026-05-07T00:00:00.000Z';

beforeAll(() => {
  process.env['LOG_LEVEL'] = 'fatal';
});

interface Boot {
  handle: Awaited<ReturnType<typeof createServer>>;
  ownerId: string;
  ownerToken: string;
  intruderId: string;
  intruderToken: string;
}

async function boot(): Promise<Boot> {
  const ws = mkdtempSync(path.join(tmpdir(), 'rt-teams-act-'));
  const ownerId = newUserId();
  const intruderId = newUserId();
  const ownerToken = 'owner-tok';
  const intruderToken = 'intruder-tok';
  const handle = await createServer({
    workspaceRoot: ws,
    runtimeId: 'rt-test-teams-actions',
    localUserTokens: `${ownerId}:${ownerToken},${intruderId}:${intruderToken}`,
  });
  for (const id of [ownerId, intruderId]) {
    await handle.rt.users.upsert({
      id,
      displayName: id,
      channelIdentities: { email: `${id}@x.com` },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  return { handle, ownerId, ownerToken, intruderId, intruderToken };
}

async function seed(
  b: Boot,
  teamStatus: Team['status'] = 'active',
): Promise<{
  threadId: string;
  taskId: string;
  teamId: string;
  teammateId: string;
}> {
  const threadId = newThreadId();
  const taskId = newTaskId();
  const teamId = newTeamId();
  await b.handle.rt.threads.create({
    id: threadId,
    ownerUserId: b.ownerId,
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
    ownerUserId: b.ownerId,
    title: 't',
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
  await b.handle.rt.tasks.create(task);
  const team: Team = {
    id: teamId,
    parentTaskId: taskId,
    parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
    threadId,
    status: teamStatus,
    roster: [
      {
        slotId: newWorkItemId(),
        slotName: 's',
        maxConcurrentClaims: 1,
        status: 'pending',
      },
    ],
    budget: {
      maxDurationMs: 1_000_000,
      maxTokens: 1_000_000,
      maxTeammates: 1,
      maxWorkItems: 16,
      maxMessages: 200,
    },
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await b.handle.rt.teams.saveTeam(team);
  const teammateId = newTeammateId();
  const tm: Teammate = {
    id: teammateId,
    teamId,
    slotId: team.roster[0]!.slotId,
    runtimeActorId: 'ac_aaaaaaaaaaaaaaaaaaaaa',
    status: 'idle',
    budget: { maxDurationMs: 60_000, maxTokens: 1_000, maxSubagents: 4 },
    schemaVersion: 1,
    createdAt: NOW,
    updatedAt: NOW,
  };
  await b.handle.rt.teams.saveTeammate(threadId, taskId, tm);
  return { threadId, taskId, teamId, teammateId };
}

const handles: Boot[] = [];
afterEach(async () => {
  for (const b of handles.splice(0)) {
    try {
      await b.handle.close();
    } catch {
      // ignore
    }
  }
});

describe('Team action routes — owner & status checks (acceptance 68)', () => {
  it('non-owner team_cancel → 403 + task_action_denied{not_owner}', async () => {
    const b = await boot();
    handles.push(b);
    const s = await seed(b);
    const res = await b.handle.app.inject({
      method: 'POST',
      url: `/api/tasks/${s.taskId}/teams/${s.teamId}/cancel`,
      headers: { authorization: `Bearer ${b.intruderToken}` },
    });
    expect(res.statusCode).toBe(403);
    const events = await b.handle.rt.tasks.readEventsSince(s.threadId, s.taskId, 0);
    const denied = events.find(
      (e) =>
        e.kind === 'task_action_denied' &&
        (e.payload as { reason: string }).reason === 'not_owner',
    );
    expect(denied).toBeTruthy();
    expect((denied!.payload as { requestedAction: string }).requestedAction).toBe(
      'team_cancel',
    );
  });

  it('owner cancel on terminal team → 409 + task_action_denied{terminal_state}', async () => {
    const b = await boot();
    handles.push(b);
    const s = await seed(b, 'completed');
    const res = await b.handle.app.inject({
      method: 'POST',
      url: `/api/tasks/${s.taskId}/teams/${s.teamId}/cancel`,
      headers: { authorization: `Bearer ${b.ownerToken}` },
    });
    expect(res.statusCode).toBe(409);
    const events = await b.handle.rt.tasks.readEventsSince(s.threadId, s.taskId, 0);
    const denied = events.find(
      (e) =>
        e.kind === 'task_action_denied' &&
        (e.payload as { reason: string }).reason === 'terminal_state',
    );
    expect(denied).toBeTruthy();
    expect((denied!.payload as { requestedAction: string }).requestedAction).toBe(
      'team_cancel',
    );
  });

  it('non-owner teammate_approve → 403 + task_action_denied{not_owner, teammate_approve}', async () => {
    const b = await boot();
    handles.push(b);
    const s = await seed(b);
    const res = await b.handle.app.inject({
      method: 'POST',
      url: `/api/tasks/${s.taskId}/teams/${s.teamId}/teammates/${s.teammateId}/approve`,
      headers: { authorization: `Bearer ${b.intruderToken}` },
    });
    expect(res.statusCode).toBe(403);
    const events = await b.handle.rt.tasks.readEventsSince(s.threadId, s.taskId, 0);
    const denied = events.find(
      (e) =>
        e.kind === 'task_action_denied' &&
        (e.payload as { requestedAction: string }).requestedAction === 'teammate_approve',
    );
    expect(denied).toBeTruthy();
  });

  it('non-owner teammate_reject → 403 + task_action_denied{not_owner, teammate_reject}', async () => {
    const b = await boot();
    handles.push(b);
    const s = await seed(b);
    const res = await b.handle.app.inject({
      method: 'POST',
      url: `/api/tasks/${s.taskId}/teams/${s.teamId}/teammates/${s.teammateId}/reject`,
      headers: { authorization: `Bearer ${b.intruderToken}` },
    });
    expect(res.statusCode).toBe(403);
    const events = await b.handle.rt.tasks.readEventsSince(s.threadId, s.taskId, 0);
    const denied = events.find(
      (e) =>
        e.kind === 'task_action_denied' &&
        (e.payload as { requestedAction: string }).requestedAction === 'teammate_reject',
    );
    expect(denied).toBeTruthy();
  });

  it('owner cancel on active team → 200', async () => {
    const b = await boot();
    handles.push(b);
    const s = await seed(b);
    const res = await b.handle.app.inject({
      method: 'POST',
      url: `/api/tasks/${s.taskId}/teams/${s.teamId}/cancel`,
      headers: { authorization: `Bearer ${b.ownerToken}` },
    });
    expect(res.statusCode).toBe(200);
    const team = await b.handle.rt.teams.getTeam(s.threadId, s.taskId, s.teamId);
    expect(team?.status).toBe('cancelled');
  });
});
