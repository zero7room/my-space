import { z } from "zod";
import { PlanIdSchema, TaskIdSchema, ThreadIdSchema } from "./thread.js";
import { UserIdSchema } from "./user.js";

export const GuardIntentSchema = z.enum([
  "chat",
  "new_task",
  "task_update",
  "plan_update",
  "confirm_task",
  "confirm_plan",
  "progress_query",
  "cancel_task",
  "irrelevant",
]);
export type GuardIntent = z.infer<typeof GuardIntentSchema>;

export const GuardSourceSchema = z.enum([
  "client",
  "lark_private",
  "lark_group",
  "slack",
  "wecom",
  "email",
  "custom",
]);
export type GuardSource = z.infer<typeof GuardSourceSchema>;

export const GuardDecisionSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  threadId: ThreadIdSchema,
  fromUserId: UserIdSchema.optional(),
  source: GuardSourceSchema,
  intent: GuardIntentSchema,
  targetTaskId: TaskIdSchema.optional(),
  targetPlanId: PlanIdSchema.optional(),
  shortCircuited: z.boolean(),
  ruleHits: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  requiresUserConfirmation: z.boolean(),
  reason: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type GuardDecision = z.infer<typeof GuardDecisionSchema>;
