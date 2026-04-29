import { z } from "zod";
import { PlanIdSchema, TaskIdSchema, ThreadIdSchema } from "./thread.js";
import { UserIdSchema } from "./user.js";

export const TaskStatusSchema = z.enum([
  "draft",
  "confirmed",
  "queued",
  "running",
  "awaiting_critical_node",
  "blocked",
  "changing",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export function isTerminalTaskStatus(s: TaskStatus): boolean {
  return s === "completed" || s === "failed" || s === "cancelled";
}

export const TaskBudgetSchema = z.object({
  maxDurationMs: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  maxSubagents: z.number().int().positive().optional(),
  maxCostUsd: z.number().nonnegative().optional(),
});
export type TaskBudget = z.infer<typeof TaskBudgetSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  threadId: ThreadIdSchema,
  ownerUserId: UserIdSchema,
  confirmedByUserId: UserIdSchema.optional(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  sourceMessageIds: z.array(z.string()),
  planId: PlanIdSchema.optional(),
  activePlanRevisionId: z.string().optional(),
  assignedRuntimeId: z.string().optional(),
  assignedExecutorId: z.string().optional(),
  budget: TaskBudgetSchema.optional(),
  artifactIds: z.array(z.string()),
  changeRecordIds: z.array(z.string()),
  archivedRevisionIds: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Task = z.infer<typeof TaskSchema>;

export const DEFAULT_TASK_BUDGET: TaskBudget = {
  maxDurationMs: 4 * 60 * 60 * 1000,
  maxTokens: 1_000_000,
  maxSubagents: 8,
};
