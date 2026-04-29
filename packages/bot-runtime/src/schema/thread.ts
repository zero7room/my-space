import { z } from "zod";
import { UserIdSchema } from "./user.js";

const IdRe = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ThreadIdSchema = z.string().regex(IdRe);
export const TaskIdSchema = z.string().regex(IdRe);
export const PlanIdSchema = z.string().regex(IdRe);

export const ThreadStatusSchema = z.enum([
  "chatting",
  "planning",
  "waiting_confirmation",
  "working",
  "blocked",
  "idle",
]);
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const ThreadSchema = z.object({
  id: ThreadIdSchema,
  ownerUserId: UserIdSchema,
  title: z.string(),
  status: ThreadStatusSchema,
  taskListId: z.string(),
  activeTaskId: TaskIdSchema.optional(),
  draftTaskId: TaskIdSchema.optional(),
  draftPlanId: PlanIdSchema.optional(),
  channelBindingIds: z.array(z.string()),
  contextSummary: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Thread = z.infer<typeof ThreadSchema>;
