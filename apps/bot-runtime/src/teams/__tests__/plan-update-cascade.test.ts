/**
 * Acceptance 62 — PlanRevision creation with an active team must first
 * cascade-cancel the team and wait for terminal status. Verified via
 * timestamps in events.jsonl: `team_cancelled` (in team-events) must be
 * earlier than (or equal to) `plan_revising` and `task_retry_reset_by_plan_update`
 * (in task events.jsonl).
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
  newPlanId,
  newPlanRevisionId,
  newEventId,
  type Task,
  type Plan,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { TeamRuntime } from '../index.js';
import { PlanRevisionService } from '../../thread-loop/plan-revisions.js';

let nowCounter = 0;
function nextNow(): string {
  nowCounter += 1;
  return new Date(Date.UTC(2026, 4, 7, 0, 0, nowCounter)).toISOString();
}

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'plan-cascade-')),
    runtimeId: 'rt-plan',
  });
}

describe('PlanRevision cascades cancel to active team (acceptance 62)', () => {
  it('team_cancelled timestamp precedes PlanRevision events in events.jsonl', async () => {
    nowCounter = 0;
    const rt = mkrt();
    const owner = newUserId();
    const threadId = newThreadId();
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 't',
      status: 'working',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: nextNow(),
      updatedAt: nextNow(),
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
      retry: { attemptCount: 1, maxRetries: 2, failureClass: 'transient_error' },
      blockedReason: 'retry_pending',
      createdAt: nextNow(),
      updatedAt: nextNow(),
    };
    await rt.tasks.create(task);

    // Create active team.
    const tr = new TeamRuntime({ rt, now: nextNow });
    const { team } = await tr.createTeam({
      threadId,
      parentTaskId: task.id,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 'coder' }],
    });
    expect(team.status).toBe('active');

    const oldRev = newPlanRevisionId();
    const newPlan: Plan = {
      id: newPlanId(),
      taskId: task.id,
      status: 'active',
      objective: 'do',
      steps: [],
      expectedArtifacts: [],
      revisionIds: [],
      createdAt: nextNow(),
      updatedAt: nextNow(),
    };

    const svc = new PlanRevisionService(rt, undefined, nextNow);
    await svc.revise({
      threadId,
      task,
      oldPlanRevisionId: oldRev,
      newPlan,
      reason: 'user clarified',
      triggerMessageId: newEventId(),
      triggerUserId: owner,
    });

    // The team must be cancelled.
    const t = await rt.teams.getTeam(threadId, task.id, team.id);
    expect(t?.status).toBe('cancelled');

    // Ordering: team_cancelled must precede plan_revising AND
    // task_retry_reset_by_plan_update in their respective logs.
    const teamEvents = await rt.teams.readTeamEvents(threadId, task.id, team.id);
    const taskEvents = await rt.tasks.readEventsSince(threadId, task.id, 0);
    const teamCancelled = teamEvents.find((e) => e.kind === 'team_cancelled');
    const planRevising = taskEvents.find((e) => e.kind === 'plan_revising');
    const retryReset = taskEvents.find((e) => e.kind === 'task_retry_reset_by_plan_update');
    expect(teamCancelled).toBeDefined();
    expect(planRevising).toBeDefined();
    expect(retryReset).toBeDefined();
    expect(Date.parse(teamCancelled!.at)).toBeLessThanOrEqual(Date.parse(planRevising!.at));
    expect(Date.parse(teamCancelled!.at)).toBeLessThanOrEqual(Date.parse(retryReset!.at));
  });
});
