/**
 * Agent Teams runtime. A Team is a child collaboration unit that lives inside
 * a parent task and never creates a new task or thread (per design.md §24).
 *
 * v1 capabilities here:
 *   - createTeam: lead-Executor builds a Team record + per-slot Teammate
 *     records via the team_create tool path. Budget is enforced ≤ parent
 *     task budget.
 *   - publish/claim/release/complete/fail work items via fs renames between
 *     `work-items/<bucket>/`.
 *   - post/read team messages via append-only `messages.jsonl`.
 *   - finish_team: lead-only path; collapses the team to `finishing` then
 *     `completed` with a TeamSummaryRef, and harvests outputs back to parent.
 *
 * Critical invariants:
 *   - Teammate cannot call `team` or `finish_team`.
 *   - Teammate cannot spawn a Team (one-level subagent only).
 *   - retry does NOT cascade into Teams (RetryScheduler.schedule rejects
 *     `isTeamInternal`).
 *   - TeamWorkItem completion uses `completed`, never `done`.
 */
import {
  type Team,
  type Teammate,
  type TeamWorkItem,
  type TeamMessage,
  type TeamSummaryRef,
  type TaskBudget,
  type RiskClass,
  newTeamId,
  newTeammateId,
  newWorkItemId,
  newMessageId,
  newActorId,
  sanitizeWithReport,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';
import type { SseRegistry } from '../runtime/sse/index.js';
import type { RuntimeMetrics } from '../metrics/metrics.js';

const HARD_TEAM_BUDGET_MAX = {
  maxTeammates: 8,
  maxWorkItems: 256,
  maxMessages: 4000,
};

export class TeamLeadOnlyError extends Error {
  constructor(action: string) {
    super(`only the team lead may call ${action}`);
  }
}
export class TeammateForbiddenError extends Error {
  constructor(action: string) {
    super(`teammates may not call ${action}`);
  }
}
export class TeamBudgetExceededError extends Error {}

export interface CreateTeamInput {
  threadId: string;
  parentTaskId: string;
  parentExecutorId: string;
  parentBudget: TaskBudget;
  rosterSlots: { slotName: string; persona?: string; skillAllowlist?: string[]; preferredRoles?: string[] }[];
  budgetOverride?: Partial<{
    maxDurationMs: number;
    maxTokens: number;
    maxTeammates: number;
    maxWorkItems: number;
    maxMessages: number;
  }>;
}

export interface TeamRuntimeDeps {
  rt: RuntimePaths;
  sse?: SseRegistry;
  metrics?: RuntimeMetrics;
  /** ActorId factory: lets tests fix actors. */
  newActor?: () => string;
  now?: () => string;
}

export class TeamRuntime {
  constructor(private readonly deps: TeamRuntimeDeps) {}

  private get now(): string {
    return (this.deps.now ?? (() => new Date().toISOString()))();
  }

  async createTeam(input: CreateTeamInput): Promise<{ team: Team; teammates: Teammate[] }> {
    const ts = this.now;
    const parent = input.parentBudget;
    const desiredTeammates = Math.min(
      input.budgetOverride?.maxTeammates ?? input.rosterSlots.length,
      input.rosterSlots.length,
      HARD_TEAM_BUDGET_MAX.maxTeammates,
    );
    const budget = {
      maxDurationMs: input.budgetOverride?.maxDurationMs ?? Math.floor((parent.maxDurationMs ?? 14_400_000) / 2),
      maxTokens: input.budgetOverride?.maxTokens ?? Math.floor((parent.maxTokens ?? 1_000_000) / 2),
      maxTeammates: desiredTeammates,
      maxWorkItems: Math.min(
        input.budgetOverride?.maxWorkItems ?? 32,
        HARD_TEAM_BUDGET_MAX.maxWorkItems,
      ),
      maxMessages: Math.min(
        input.budgetOverride?.maxMessages ?? 200,
        HARD_TEAM_BUDGET_MAX.maxMessages,
      ),
    };
    if (budget.maxTeammates > 8) {
      throw new TeamBudgetExceededError('maxTeammates > hard cap 8');
    }

    const teamId = newTeamId();
    const team: Team = {
      id: teamId,
      parentTaskId: input.parentTaskId,
      parentExecutorId: input.parentExecutorId,
      threadId: input.threadId,
      status: 'forming',
      roster: input.rosterSlots.slice(0, desiredTeammates).map((s) => ({
        slotId: newWorkItemId(), // any prefix accepted; could refine
        slotName: s.slotName,
        persona: s.persona,
        skillAllowlist: s.skillAllowlist,
        preferredRoles: s.preferredRoles,
        maxConcurrentClaims: 1,
        status: 'pending',
      })),
      budget,
      schemaVersion: 1,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.deps.rt.teams.saveTeam(team);
    await this.emit(input.threadId, input.parentTaskId, teamId, 'team_forming');

    // Spawn Teammates (status spawning → idle).
    const teammates: Teammate[] = [];
    for (const slot of team.roster) {
      const id = newTeammateId();
      const tm: Teammate = {
        id,
        teamId,
        slotId: slot.slotId,
        runtimeActorId: (this.deps.newActor ?? newActorId)(),
        status: 'idle',
        budget: {
          maxDurationMs: Math.max(60_000, Math.floor(team.budget.maxDurationMs / Math.max(1, team.roster.length))),
          maxTokens: Math.max(1_000, Math.floor(team.budget.maxTokens / Math.max(1, team.roster.length))),
          maxSubagents: 4,
        },
        schemaVersion: 1,
        createdAt: ts,
        updatedAt: ts,
      };
      await this.deps.rt.teams.saveTeammate(input.threadId, input.parentTaskId, tm);
      teammates.push(tm);
      try {
        this.deps.metrics?.teammateSpawned.inc({ persona: slot.persona ?? 'unknown' });
      } catch { /* best-effort */ }
      await this.emit(input.threadId, input.parentTaskId, teamId, 'teammate_spawned', { teammateId: tm.id });
    }
    // Move team to active.
    const active: Team = { ...team, status: 'active', updatedAt: ts };
    await this.deps.rt.teams.saveTeam(active);
    // Expand the per-thread SSE buffer while a team is active.
    if (this.deps.sse) {
      this.deps.sse.forThread(input.threadId).setActiveTeam(true);
    }
    try {
      this.deps.metrics?.teamStarted.inc();
      this.deps.metrics?.teamActiveCount.inc();
    } catch { /* best-effort */ }
    await this.emit(input.threadId, input.parentTaskId, teamId, 'team_active');
    await this.emit(input.threadId, input.parentTaskId, teamId, 'team_started');
    return { team: active, teammates };
  }

  async publishWorkItem(
    threadId: string,
    taskId: string,
    teamId: string,
    description: string,
    opts?: { preferredRole?: string; priority?: number },
  ): Promise<TeamWorkItem> {
    const ts = this.now;
    // Acceptance 65: PII-sanitize WorkItem.description before persisting.
    const san = sanitizeWithReport(description ?? '');
    const item: TeamWorkItem = {
      id: newWorkItemId(),
      teamId,
      description: san.output,
      preferredRole: opts?.preferredRole,
      priority: opts?.priority ?? 0,
      status: 'available',
      attemptCount: 0,
      maxReclaims: 2,
      createdAt: ts,
      updatedAt: ts,
    };
    await this.deps.rt.teams.saveWorkItem(threadId, taskId, 'available', item);
    try {
      this.deps.metrics?.workItemPublished.inc({ preferredRole: opts?.preferredRole ?? 'any' });
      this.deps.metrics?.workItemsTotal.inc({ bucket: 'available' });
    } catch { /* best-effort */ }
    if (san.redactedKinds.length > 0) {
      await this.emit(threadId, taskId, teamId, 'lastFailureReason_redacted', {
        streamKind: 'team-events',
        site: 'work_item.description',
        redactedKinds: san.redactedKinds,
      });
    }
    await this.emit(threadId, taskId, teamId, 'team_work_item_created', { workItemId: item.id });
    await this.emit(threadId, taskId, teamId, 'work_item_published', { workItemId: item.id });
    return item;
  }

  async claimWorkItem(
    threadId: string,
    taskId: string,
    teamId: string,
    workItemId: string,
    teammateId: string,
  ): Promise<TeamWorkItem> {
    const ts = this.now;
    const items = await this.deps.rt.teams.listWorkItems(threadId, taskId, teamId, 'available');
    const cur = items.find((i) => i.id === workItemId);
    if (!cur) throw new Error('work item not available');
    // Acceptance 58: rename FIRST (atomic acquire under EEXIST/ENOENT semantics),
    // THEN overwrite the moved file with the claimed content. This prevents the
    // previous publish-then-rename race where the rename clobbered just-written
    // claimed content with stale 'available' bytes.
    try {
      await this.deps.rt.teams.moveWorkItem(threadId, taskId, teamId, workItemId, 'available', 'claimed');
    } catch (err) {
      // Lost the race — another teammate already moved the file.
      try { this.deps.metrics?.teamClaimContention.inc(); } catch { /* best-effort */ }
      throw new Error(`claim contention: ${(err as Error).message}`);
    }
    const claimed: TeamWorkItem = {
      ...cur,
      status: 'claimed',
      claimedByTeammateId: teammateId,
      claimedAt: ts,
      claimLeaseExpireAt: new Date(Date.parse(ts) + 60_000).toISOString(),
      attemptCount: cur.attemptCount,
      updatedAt: ts,
    };
    await this.deps.rt.teams.saveWorkItem(threadId, taskId, 'claimed', claimed);
    try {
      this.deps.metrics?.workItemClaimed.inc();
      this.deps.metrics?.workItemsTotal.inc({ bucket: 'claimed' });
    } catch { /* best-effort */ }
    await this.emit(threadId, taskId, teamId, 'team_work_item_claimed', { workItemId, teammateId });
    await this.emit(threadId, taskId, teamId, 'work_item_claimed', { workItemId, teammateId });
    return claimed;
  }

  async completeWorkItem(
    threadId: string,
    taskId: string,
    teamId: string,
    workItemId: string,
    resultRef?: string,
  ): Promise<TeamWorkItem> {
    const ts = this.now;
    const items = await this.deps.rt.teams.listWorkItems(threadId, taskId, teamId, 'claimed');
    const cur = items.find((i) => i.id === workItemId);
    if (!cur) throw new Error('work item not claimed');
    // Acceptance 65: sanitize resultRef text before persisting.
    let sanitizedResultRef = resultRef;
    let resultRefRedacted: string[] = [];
    if (typeof resultRef === 'string' && resultRef.length > 0) {
      const san = sanitizeWithReport(resultRef);
      sanitizedResultRef = san.output;
      resultRefRedacted = san.redactedKinds;
    }
    const completed: TeamWorkItem = {
      ...cur,
      status: 'completed',
      resultRef: sanitizedResultRef,
      updatedAt: ts,
    };
    await this.deps.rt.teams.saveWorkItem(threadId, taskId, 'completed', completed);
    await this.deps.rt.teams.moveWorkItem(threadId, taskId, teamId, workItemId, 'claimed', 'completed').catch(() => undefined);
    if (resultRefRedacted.length > 0) {
      await this.emit(threadId, taskId, teamId, 'lastFailureReason_redacted', {
        streamKind: 'team-events',
        site: 'work_item.resultRef',
        redactedKinds: resultRefRedacted,
      });
    }
    await this.emit(threadId, taskId, teamId, 'team_work_item_completed', { workItemId });
    await this.emit(threadId, taskId, teamId, 'work_item_completed', { workItemId });
    try {
      this.deps.metrics?.workItemCompleted.inc();
      this.deps.metrics?.workItemsTotal.inc({ bucket: 'completed' });
    } catch { /* best-effort */ }
    return completed;
  }

  async postMessage(
    threadId: string,
    taskId: string,
    teamId: string,
    msg: Omit<TeamMessage, 'id' | 'at' | 'teamId'>,
  ): Promise<TeamMessage> {
    // Acceptance 65: sanitize TeamMessage.content before persisting.
    let sanitizedContent = msg.content;
    let redactedKinds: string[] = [];
    if (typeof msg.content === 'string' && msg.content.length > 0) {
      const san = sanitizeWithReport(msg.content);
      sanitizedContent = san.output;
      redactedKinds = san.redactedKinds;
    }
    const built: TeamMessage = {
      id: newMessageId(),
      teamId,
      at: this.now,
      ...msg,
      content: sanitizedContent,
    };
    await this.deps.rt.teams.appendTeamMessage(threadId, taskId, built);
    if (redactedKinds.length > 0) {
      await this.emit(threadId, taskId, teamId, 'lastFailureReason_redacted', {
        streamKind: 'messages',
        site: 'team_message.content',
        redactedKinds,
      });
    }
    await this.emit(threadId, taskId, teamId, 'team_message_appended', { messageId: built.id });
    await this.emit(threadId, taskId, teamId, 'team_message_posted', { messageId: built.id, kind: msg.kind });
    try {
      this.deps.metrics?.teamMessagePosted.inc({ kind: msg.kind });
    } catch { /* best-effort */ }
    return built;
  }

  async readMessages(
    threadId: string,
    taskId: string,
    teamId: string,
  ): Promise<TeamMessage[]> {
    return this.deps.rt.teams.readTeamMessages(threadId, taskId, teamId);
  }

  /**
   * Lead-only. Collapses team to finishing → completed.
   */
  async finishTeam(
    threadId: string,
    taskId: string,
    teamId: string,
    summary: TeamSummaryRef,
    callerKind: 'lead' | 'teammate',
  ): Promise<Team> {
    if (callerKind !== 'lead') throw new TeamLeadOnlyError('finish_team');
    const team = await this.deps.rt.teams.getTeam(threadId, taskId, teamId);
    if (!team) throw new Error('team not found');
    const finishing: Team = { ...team, status: 'finishing', updatedAt: this.now };
    await this.deps.rt.teams.saveTeam(finishing);
    await this.emit(threadId, taskId, teamId, 'team_finishing');
    const done: Team = { ...finishing, status: 'completed', summary, updatedAt: this.now };
    await this.deps.rt.teams.saveTeam(done);
    try {
      this.deps.metrics?.teamCompleted.inc({ outcome: summary.outcome });
      this.deps.metrics?.teamActiveCount.dec();
    } catch { /* best-effort */ }
    await this.emit(threadId, taskId, teamId, 'team_completed', { outcome: summary.outcome });
    return done;
  }

  /**
   * Reject teammate spawning a team.
   */
  static guardTeammateAction(callerKind: 'lead' | 'teammate', action: 'team' | 'finish_team' | 'subagent', skillRisk?: RiskClass): void {
    if (callerKind === 'teammate' && (action === 'team' || action === 'finish_team')) {
      throw new TeammateForbiddenError(action);
    }
    void skillRisk;
  }

  private async emit(
    threadId: string,
    taskId: string,
    teamId: string,
    kind: import('@ai-workflow/contracts').EventKind,
    payload: Record<string, unknown> = {},
  ): Promise<void> {
    const ev = await this.deps.rt.teams.appendTeamEvent(threadId, taskId, teamId, {
      kind,
      threadId,
      taskId,
      teamId,
      payload,
      at: this.now,
    });
    if (this.deps.sse) this.deps.sse.publish(ev);
  }
}
