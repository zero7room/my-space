import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newThreadId,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import {
  TeamLeadOnlyError,
  TeamRuntime,
  TeammateForbiddenError,
} from '../index.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'teams-')),
    runtimeId: 'rt-teams',
  });
}

const NOW = '2026-05-07T00:00:00.000Z';

describe('TeamRuntime', () => {
  it('creates a team within parent budget and spawns teammates', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team, teammates } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 14_400_000, maxTokens: 1_000_000, maxSubagents: 8 },
      rosterSlots: [
        { slotName: 'researcher' },
        { slotName: 'coder-1' },
        { slotName: 'coder-2' },
      ],
    });
    expect(team.status).toBe('active');
    expect(team.budget.maxDurationMs).toBe(7_200_000);
    expect(teammates.length).toBe(3);
    expect(teammates.every((t) => t.status === 'idle')).toBe(true);
    const events = await rt.teams.readTeamEvents(threadId, parentTaskId, team.id);
    expect(events.some((e) => e.kind === 'team_active')).toBe(true);
  });

  it('publish → claim → complete a work item', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team, teammates } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 'coder-1' }],
    });
    const wi = await tr.publishWorkItem(threadId, parentTaskId, team.id, 'do thing');
    expect(wi.status).toBe('available');
    const claimed = await tr.claimWorkItem(threadId, parentTaskId, team.id, wi.id, teammates[0]!.id);
    expect(claimed.status).toBe('claimed');
    const completed = await tr.completeWorkItem(threadId, parentTaskId, team.id, wi.id);
    expect(completed.status).toBe('completed');
    const events = await rt.teams.readTeamEvents(threadId, parentTaskId, team.id);
    expect(events.some((e) => e.kind === 'team_work_item_completed')).toBe(true);
    expect(events.some((e) => e.kind === 'team_work_item_claimed')).toBe(true);
  });

  it('finish_team is lead-only', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 's' }],
    });
    await expect(
      tr.finishTeam(threadId, parentTaskId, team.id, {
        outcome: 'completed',
        summaryText: 's',
        harvestedOutputIds: [],
      }, 'teammate'),
    ).rejects.toBeInstanceOf(TeamLeadOnlyError);
    const done = await tr.finishTeam(
      threadId,
      parentTaskId,
      team.id,
      { outcome: 'completed', summaryText: 'all good', harvestedOutputIds: [] },
      'lead',
    );
    expect(done.status).toBe('completed');
    expect(done.summary?.outcome).toBe('completed');
  });

  it('teammate cannot call team or finish_team', () => {
    expect(() => TeamRuntime.guardTeammateAction('teammate', 'team')).toThrow(TeammateForbiddenError);
    expect(() => TeamRuntime.guardTeammateAction('teammate', 'finish_team')).toThrow(TeammateForbiddenError);
    expect(() => TeamRuntime.guardTeammateAction('lead', 'team')).not.toThrow();
  });

  it('uses completed not done for work items', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team, teammates } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 's' }],
    });
    const wi = await tr.publishWorkItem(threadId, parentTaskId, team.id, 'x');
    await tr.claimWorkItem(threadId, parentTaskId, team.id, wi.id, teammates[0]!.id);
    const completed = await tr.completeWorkItem(threadId, parentTaskId, team.id, wi.id);
    // Persisted file is in completed/ bucket, not done/.
    const inCompleted = await rt.teams.listWorkItems(threadId, parentTaskId, team.id, 'completed');
    expect(inCompleted.find((i) => i.id === wi.id)).toBeDefined();
    expect(completed.status).toBe('completed');
  });
});
