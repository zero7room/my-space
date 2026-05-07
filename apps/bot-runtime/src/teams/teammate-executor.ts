/**
 * Per-teammate critical-node policy gate (acceptance 64).
 *
 * The current `CriticalNodePolicyEngine.evaluate(...)` is stateless — calling
 * it does not memoize. This module exposes a typed wrapper that:
 *
 *   1. Forces the caller to pass `teamId` + `teammateId` for every call so
 *      no two teammates can ever share an evaluation by accident.
 *   2. Threads the teammate's roster-slot persona into `skillName` for
 *      `scope: skill` policies (acceptance 64 last sentence).
 *   3. Emits `teammate_critical_node_hit` and transitions the teammate to
 *      `awaiting_critical_node` when the engine returns `require_approval`.
 *
 * This is the call site teammate dispatch loops MUST funnel through. The
 * v1 wiring is a placeholder: there is no full teammate executor in v1 — the
 * function is exported so when one lands it goes through this gate (and the
 * test suite asserts the contract today).
 */
import type {
  CriticalNodePolicy,
  Teammate,
  Team,
} from '@ai-workflow/contracts';

import type { CriticalNodePolicyEngine, PolicyDecision, PolicyRequest } from '../critical-node/policy-engine.js';
import type { RuntimePaths } from '../runtime/paths.js';
import type { SseRegistry } from '../runtime/sse/index.js';

export interface TeammateToolCall {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  /** Optional skill name; if not provided, slot persona is used as the skill. */
  skillName?: string;
}

export interface EvaluateTeammateInput {
  rt: RuntimePaths;
  sse?: SseRegistry;
  policyEngine: CriticalNodePolicyEngine;
  threadId: string;
  taskId: string;
  team: Team;
  teammate: Teammate;
  call: TeammateToolCall;
  now?: () => string;
}

export interface EvaluateTeammateResult {
  decision: PolicyDecision;
  /** True if the teammate should proceed to dispatch this tool call. */
  proceed: boolean;
}

/**
 * Evaluate a single teammate tool call. NEVER caches results — every call
 * triggers a fresh `policyEngine.evaluate(...)` so approving teammate A does
 * not bypass teammate B (acceptance 64).
 */
export async function evaluateTeammateToolCall(
  input: EvaluateTeammateInput,
): Promise<EvaluateTeammateResult> {
  const ts = (input.now ?? (() => new Date().toISOString()))();
  // Resolve the teammate's slot persona for scope:skill policies.
  const slot = input.team.roster.find((s) => s.slotId === input.teammate.slotId);
  const persona = slot?.persona;
  const req: PolicyRequest = {
    toolName: input.call.toolName,
    toolArgs: input.call.toolArgs,
    skillName: input.call.skillName ?? persona,
  };
  // Stateless evaluate — no memoization across teammates.
  const decision = input.policyEngine.evaluate(req);
  if (decision.action === 'block') {
    await appendTeammateEvent(input, ts, 'teammate_critical_node_hit', {
      teammateId: input.teammate.id,
      policyIds: decision.matched.map((p: CriticalNodePolicy) => p.id),
      matcher: decision.matched[0]?.matcher,
      reason: decision.reason,
      action: 'block',
    });
    return { decision, proceed: false };
  }
  if (decision.action === 'require_approval') {
    // Transition the teammate to awaiting_critical_node and emit hit event.
    await input.rt.teams.saveTeammate(input.threadId, input.taskId, {
      ...input.teammate,
      status: 'awaiting_critical_node',
      updatedAt: ts,
    });
    await appendTeammateEvent(input, ts, 'teammate_critical_node_hit', {
      teammateId: input.teammate.id,
      policyIds: decision.matched.map((p: CriticalNodePolicy) => p.id),
      matcher: decision.matched[0]?.matcher,
      reason: decision.reason,
      action: 'require_approval',
    });
    return { decision, proceed: false };
  }
  // log_only or no match → proceed.
  return { decision, proceed: true };
}

async function appendTeammateEvent(
  input: EvaluateTeammateInput,
  at: string,
  kind: 'teammate_critical_node_hit',
  payload: Record<string, unknown>,
): Promise<void> {
  const ev = await input.rt.teams.appendTeamEvent(
    input.threadId,
    input.taskId,
    input.team.id,
    {
      kind,
      threadId: input.threadId,
      taskId: input.taskId,
      teamId: input.team.id,
      payload,
      at,
    },
  );
  if (input.sse) input.sse.publish(ev);
}
