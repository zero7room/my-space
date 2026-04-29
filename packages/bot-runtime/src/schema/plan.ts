import { z } from "zod";
import { PlanIdSchema, TaskIdSchema } from "./thread.js";

export const PlanStatusSchema = z.enum([
  "draft",
  "pending_confirmation",
  "active",
  "revising",
  "superseded",
  "completed",
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum([
    "pending",
    "in_progress",
    "completed",
    "blocked",
    "skipped",
    "superseded",
    "failed",
  ]),
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  evidence: z.array(z.string()).optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  id: PlanIdSchema,
  taskId: TaskIdSchema,
  status: PlanStatusSchema,
  objective: z.string(),
  steps: z.array(PlanStepSchema),
  expectedArtifacts: z.array(z.string()),
  revisionIds: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlanRevisionSchema = z.object({
  id: z.string(),
  planId: PlanIdSchema,
  taskId: TaskIdSchema,
  status: z.enum(["active", "superseded"]),
  fullPlan: PlanSchema,
  reason: z.string(),
  sourceMessageId: z.string(),
  archivedArtifactPaths: z.array(z.string()),
  supersededAt: z.string().datetime({ offset: true }).optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type PlanRevision = z.infer<typeof PlanRevisionSchema>;
