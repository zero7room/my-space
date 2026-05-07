/**
 * Durable event kinds.
 *
 * Every event written to `events.jsonl` (per-task or per-team) MUST use one of
 * these kinds. Adding a new kind requires updating runtime emitters and SSE
 * fan-out together — that's why this module is the single source of truth.
 */

export const TASK_EVENT_KINDS = [
  'task_drafted',
  'task_confirmed',
  'task_rejected',
  'task_queued',
  'task_started',
  'task_paused',
  'task_resumed',
  'task_cancelled',
  'task_completed',
  'task_failed',
  'task_blocked',
  'task_unblocked',
  'task_state_transition',
  'task_state_transition_blocked',
  'task_retry_scheduled',
  'task_retry_started',
  'task_retry_exhausted',
  'task_manual_retry_requested',
  'task_retry_reset_by_plan_update',
  'task_list_repair',
] as const;
export type TaskEventKind = (typeof TASK_EVENT_KINDS)[number];

export const PLAN_EVENT_KINDS = [
  'plan_drafted',
  'plan_pending_confirmation',
  'plan_confirmed',
  'plan_revising',
  'plan_revised',
  'plan_superseded',
  'plan_completed',
  'plan_step_started',
  'plan_step_completed',
  'plan_step_failed',
  'plan_step_skipped',
] as const;
export type PlanEventKind = (typeof PLAN_EVENT_KINDS)[number];

export const TOOL_EVENT_KINDS = [
  'tool_call_started',
  'tool_call_completed',
  'tool_call_failed',
  'tool_call_blocked_by_critical_node',
  'tool_call_approved',
  'tool_call_rejected',
] as const;
export type ToolEventKind = (typeof TOOL_EVENT_KINDS)[number];

export const SUBAGENT_EVENT_KINDS = [
  'subagent_spawned',
  'subagent_completed',
  'subagent_failed',
] as const;
export type SubagentEventKind = (typeof SUBAGENT_EVENT_KINDS)[number];

export const TEAM_EVENT_KINDS = [
  'team_forming',
  'team_active',
  'team_finishing',
  'team_completed',
  'team_failed',
  'team_cancelled',
  'team_message_appended',
  'team_work_item_created',
  'team_work_item_claimed',
  'team_work_item_released',
  'team_work_item_completed',
  'team_work_item_failed',
  'team_work_item_cancelled',
  'teammate_spawned',
  'teammate_idle',
  'teammate_working',
  'teammate_finished',
  'teammate_failed',
  'teammate_cancelled',
] as const;
export type TeamEventKind = (typeof TEAM_EVENT_KINDS)[number];

export const CHANNEL_EVENT_KINDS = [
  'channel_binding_created',
  'channel_binding_state_changed',
  'channel_binding_disabled',
  'channel_inbound_received',
  'channel_inbound_processed',
  'channel_inbound_skipped',
  'channel_outbound_started',
  'channel_outbound_succeeded',
  'channel_outbound_failed',
  'channel_outbound_dead',
  'channel_notify_throttled',
] as const;
export type ChannelEventKind = (typeof CHANNEL_EVENT_KINDS)[number];

export const RUNTIME_EVENT_KINDS = [
  'runtime_started',
  'runtime_stopped',
  'runtime_recovery_scan_started',
  'runtime_recovery_scan_completed',
  'transaction_pending_dropped',
  'lease_expired',
  'sanitization_applied',
  'critical_policy_changed',
  'skills_load_error',
  'skills_loaded',
  'skills_fallback_to_cache',
  'artifact_consistency_warning',
  'events_jsonl_rotated',
  'sse_ack_missing',
  'sse_replay_emitted',
  'sse_replay_truncated',
  'thread_returned_to_chatting',
] as const;
export type RuntimeEventKind = (typeof RUNTIME_EVENT_KINDS)[number];

export const ALL_EVENT_KINDS = [
  ...TASK_EVENT_KINDS,
  ...PLAN_EVENT_KINDS,
  ...TOOL_EVENT_KINDS,
  ...SUBAGENT_EVENT_KINDS,
  ...TEAM_EVENT_KINDS,
  ...CHANNEL_EVENT_KINDS,
  ...RUNTIME_EVENT_KINDS,
] as const;
export type EventKind = (typeof ALL_EVENT_KINDS)[number];

export const EVENT_KIND_SET: ReadonlySet<EventKind> = new Set(ALL_EVENT_KINDS);

export function isEventKind(value: unknown): value is EventKind {
  return typeof value === 'string' && EVENT_KIND_SET.has(value as EventKind);
}
