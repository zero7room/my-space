import { z } from "zod";
import { TaskBudgetSchema } from "./task.js";
import { TaskIdSchema, ThreadIdSchema } from "./thread.js";

export const ExecuteTaskJobSchema = z.object({
  id: z.string(),
  type: z.literal("execute_task"),
  taskId: TaskIdSchema,
  threadId: ThreadIdSchema,
  planRevisionId: z.string(),
  assignedAt: z.string().datetime({ offset: true }),
  fencingToken: z.number().int().positive(),
  budget: TaskBudgetSchema.optional(),
  lockHolder: z.string().optional(),
  leaseExpireAt: z.string().datetime({ offset: true }).optional(),
});
export type ExecuteTaskJob = z.infer<typeof ExecuteTaskJobSchema>;

export const TaskControlSchema = z.object({
  signal: z.enum(["pause", "resume", "cancel", "revise"]).optional(),
  revisionId: z.string().optional(),
  signalAt: z.string().datetime({ offset: true }),
  signalFencingToken: z.number().int().nonnegative(),
});
export type TaskControl = z.infer<typeof TaskControlSchema>;
