import { z } from "zod";

const At = z.string().datetime({ offset: true });

export const ExecutorEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("executor_started"),
    executorId: z.string(),
    fencingToken: z.number().int().positive(),
    at: At,
  }),
  z.object({
    kind: z.literal("tool_call"),
    toolName: z.string(),
    argsRef: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("tool_result"),
    toolName: z.string(),
    resultRef: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("plan_step_updated"),
    stepId: z.string(),
    status: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("subagent_spawned"),
    subagentId: z.string(),
    parentStepId: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("subagent_completed"),
    subagentId: z.string(),
    summaryRef: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("critical_node_hit"),
    policyId: z.string(),
    action: z.enum(["require_approval", "block", "log_only"]),
    at: At,
  }),
  z.object({
    kind: z.literal("executor_paused"),
    reason: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("executor_heartbeat"),
    at: At,
  }),
  z.object({
    kind: z.literal("executor_finished"),
    outcome: z.enum(["completed", "failed", "cancelled"]),
    summaryRef: z.string().optional(),
    error: z.string().optional(),
    at: At,
  }),
]);
export type ExecutorEvent = z.infer<typeof ExecutorEventSchema>;

export type ExecutorEventKind = ExecutorEvent["kind"];
