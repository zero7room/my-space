/**
 * State machine definitions.
 *
 * Each machine is exported as a triple:
 *   - the state literal union type (`<Name>State`)
 *   - the transition table (`<Name>_TRANSITIONS`)
 *   - a pure `transition<Name>(from, to)` guard returning a TransitionDecision
 *
 * Higher-level wrappers (`canTransitionTask` etc.) live in `./states.transitions.ts`
 * and apply additional context-aware rules (retry config, owner check, blocked
 * reason validation). Discriminated unions for state-with-payload live in
 * `./schemas.ts`.
 */

export type TransitionDecision =
  | { ok: true }
  | { ok: false; reason: string };

// ---------- Task state machine ---------------------------------------------

export type TaskState =
  | 'draft'
  | 'confirmed'
  | 'queued'
  | 'running'
  | 'awaiting_critical_node'
  | 'blocked'
  | 'paused'
  | 'changing'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Edges allowed by the Task state machine. Adapted directly from
 * `init/design.md` §9.1. The `failed → queued` edge is included; the
 * higher-level `canTransitionTask` guard further restricts it to one of three
 * controlled paths (auto retry / manual retry / plan_update reset).
 */
export const TASK_TRANSITIONS: Readonly<Record<TaskState, readonly TaskState[]>> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['queued', 'cancelled'],
  queued: ['running', 'cancelled', 'paused'],
  running: ['awaiting_critical_node', 'blocked', 'changing', 'completed', 'failed'],
  awaiting_critical_node: ['running', 'cancelled', 'paused'],
  blocked: ['running', 'queued', 'cancelled', 'paused', 'failed'],
  paused: ['queued', 'cancelled', 'changing'],
  changing: ['queued', 'cancelled'],
  completed: [],
  failed: ['queued'],
  cancelled: [],
};

export function transitionTask(from: TaskState, to: TaskState): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = TASK_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Task cannot transition from ${from} to ${to}` };
  }
  return { ok: true };
}

// ---------- Plan state machine ---------------------------------------------

export type PlanState =
  | 'draft'
  | 'pending_confirmation'
  | 'active'
  | 'revising'
  | 'superseded'
  | 'completed';

export const PLAN_TRANSITIONS: Readonly<Record<PlanState, readonly PlanState[]>> = {
  draft: ['pending_confirmation'],
  pending_confirmation: ['active', 'draft'],
  active: ['revising', 'superseded', 'completed'],
  revising: ['active', 'superseded'],
  superseded: [],
  completed: [],
};

export function transitionPlan(from: PlanState, to: PlanState): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = PLAN_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Plan cannot transition from ${from} to ${to}` };
  }
  return { ok: true };
}

// ---------- Thread state machine -------------------------------------------

export type ThreadState =
  | 'chatting'
  | 'planning'
  | 'waiting_confirmation'
  | 'working'
  | 'blocked'
  | 'paused'
  | 'awaiting_critical_node'
  | 'idle';

/**
 * Threads are largely a derived view (their state reflects the active task /
 * draft state). The transition table here is permissive — any cross-state hop
 * the runtime emits should be allowed — but `idle` is a hub: every other
 * state can return to it. Self-transitions are still rejected.
 */
const ALL_THREAD_STATES: readonly ThreadState[] = [
  'chatting',
  'planning',
  'waiting_confirmation',
  'working',
  'blocked',
  'paused',
  'awaiting_critical_node',
  'idle',
];

export const THREAD_TRANSITIONS: Readonly<Record<ThreadState, readonly ThreadState[]>> =
  Object.fromEntries(
    ALL_THREAD_STATES.map((s) => [s, ALL_THREAD_STATES.filter((o) => o !== s)]),
  ) as unknown as Readonly<Record<ThreadState, readonly ThreadState[]>>;

export function transitionThread(
  from: ThreadState,
  to: ThreadState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  if (!ALL_THREAD_STATES.includes(to)) {
    return { ok: false, reason: `unknown thread state: ${to}` };
  }
  return { ok: true };
}

// ---------- ChannelBinding state machine -----------------------------------

export type ChannelBindingState =
  | 'binding'
  | 'bound'
  | 'unbinding'
  | 'failed'
  | 'disabled';

export const CHANNEL_BINDING_TRANSITIONS: Readonly<
  Record<ChannelBindingState, readonly ChannelBindingState[]>
> = {
  binding: ['bound', 'failed', 'disabled'],
  bound: ['unbinding', 'disabled', 'failed'],
  unbinding: ['disabled', 'failed'],
  failed: ['binding', 'disabled'],
  disabled: ['binding'],
};

export function transitionChannelBinding(
  from: ChannelBindingState,
  to: ChannelBindingState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = CHANNEL_BINDING_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `ChannelBinding cannot transition from ${from} to ${to}`,
    };
  }
  return { ok: true };
}

// ---------- Retry state machine --------------------------------------------
//
// Retry is not a "state" per se on Task, but on TaskRetryState: the
// failureClass attached to a failed task gates whether master may auto-requeue.

export type RetryDispositionState =
  | 'none'
  | 'pending'
  | 'scheduled'
  | 'exhausted'
  | 'reset_by_plan_update'
  | 'manual_requested';

export const RETRY_TRANSITIONS: Readonly<
  Record<RetryDispositionState, readonly RetryDispositionState[]>
> = {
  none: ['pending', 'scheduled', 'exhausted', 'reset_by_plan_update', 'manual_requested'],
  pending: ['scheduled', 'exhausted', 'reset_by_plan_update', 'manual_requested', 'none'],
  scheduled: ['none', 'exhausted', 'reset_by_plan_update', 'manual_requested', 'pending'],
  exhausted: ['reset_by_plan_update', 'manual_requested', 'none'],
  reset_by_plan_update: ['none', 'pending', 'scheduled'],
  manual_requested: ['none', 'pending', 'scheduled'],
};

export function transitionRetry(
  from: RetryDispositionState,
  to: RetryDispositionState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = RETRY_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Retry cannot transition from ${from} to ${to}` };
  }
  return { ok: true };
}

// ---------- OutboundJob state machine --------------------------------------

export type OutboundJobState =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'dead';

export const OUTBOUND_JOB_TRANSITIONS: Readonly<
  Record<OutboundJobState, readonly OutboundJobState[]>
> = {
  pending: ['running', 'failed', 'dead'],
  running: ['succeeded', 'failed', 'dead'],
  succeeded: [],
  failed: ['pending', 'dead'],
  dead: [],
};

export function transitionOutboundJob(
  from: OutboundJobState,
  to: OutboundJobState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = OUTBOUND_JOB_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `OutboundJob cannot transition from ${from} to ${to}`,
    };
  }
  return { ok: true };
}

// ---------- Team state machine ---------------------------------------------

export type TeamState =
  | 'forming'
  | 'active'
  | 'finishing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TEAM_TRANSITIONS: Readonly<Record<TeamState, readonly TeamState[]>> = {
  forming: ['active', 'failed', 'cancelled'],
  active: ['finishing', 'cancelled'],
  finishing: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function transitionTeam(from: TeamState, to: TeamState): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = TEAM_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Team cannot transition from ${from} to ${to}` };
  }
  return { ok: true };
}

// ---------- Teammate state machine -----------------------------------------

export type TeammateState =
  | 'spawning'
  | 'idle'
  | 'working'
  | 'paused'
  | 'awaiting_critical_node'
  | 'finished'
  | 'failed'
  | 'cancelled';

export const TEAMMATE_TRANSITIONS: Readonly<
  Record<TeammateState, readonly TeammateState[]>
> = {
  spawning: ['idle', 'failed'],
  idle: ['working', 'finished', 'failed', 'cancelled'],
  working: ['idle', 'awaiting_critical_node', 'paused', 'cancelled', 'failed'],
  awaiting_critical_node: ['working', 'failed', 'cancelled'],
  paused: ['working', 'cancelled'],
  finished: [],
  failed: [],
  cancelled: [],
};

export function transitionTeammate(
  from: TeammateState,
  to: TeammateState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = TEAMMATE_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return { ok: false, reason: `Teammate cannot transition from ${from} to ${to}` };
  }
  return { ok: true };
}

// ---------- TeamWorkItem state machine -------------------------------------

export type TeamWorkItemState =
  | 'available'
  | 'claimed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export const TEAM_WORK_ITEM_TRANSITIONS: Readonly<
  Record<TeamWorkItemState, readonly TeamWorkItemState[]>
> = {
  available: ['claimed', 'cancelled'],
  claimed: ['available', 'completed', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  cancelled: [],
};

export function transitionTeamWorkItem(
  from: TeamWorkItemState,
  to: TeamWorkItemState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  const allowed = TEAM_WORK_ITEM_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      reason: `TeamWorkItem cannot transition from ${from} to ${to}`,
    };
  }
  return { ok: true };
}

// ---------- Convenience: exhaustive switch helper --------------------------

/**
 * `assertNever` lets callers add exhaustive switches over state unions and get
 * a compile-time error when a new state is added but not handled.
 */
export function assertNever(x: never): never {
  throw new Error(`Unexpected variant: ${JSON.stringify(x)}`);
}
