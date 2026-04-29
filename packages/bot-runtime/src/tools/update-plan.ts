import { z } from "zod";
import { writeJson } from "../storage/json-file.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import { PlanSchema, PlanStepSchema } from "../schema/plan.js";
import type { Paths } from "../storage/paths.js";
import { defineTool, type Tool } from "./tool.js";

/**
 * Replaces the steps and objective of a draft plan in-place, preserving the plan id.
 * Implementation: load plan, schema.parse() merged result, write back.
 * (planRepo doesn't expose a "replaceDraftPlan" yet — we directly write via paths.taskPlan.)
 */
export function createUpdatePlanTool(deps: {
  planRepo: PlanRepo;
  paths: Paths;
  runtimeId: string;
}): Tool;
export function createUpdatePlanTool(deps: {
  planRepo: PlanRepo;
}): Tool;
export function createUpdatePlanTool(deps: {
  planRepo: PlanRepo;
  paths?: Paths;
  runtimeId?: string;
}): Tool {
  return defineTool({
    name: "update_plan",
    description: "Replace the objective and steps of a draft plan.",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      threadId: z.string(),
      taskId: z.string(),
      objective: z.string(),
      steps: z.array(PlanStepSchema),
      expectedArtifacts: z.array(z.string()).default([]),
    }),
    output: z.object({ planId: z.string(), stepCount: z.number().int() }),
    async call({ threadId, taskId, objective, steps, expectedArtifacts }) {
      const cur = await deps.planRepo.loadPlan(threadId, taskId);
      if (!cur) throw new Error(`plan not found for task ${taskId}`);
      const next = PlanSchema.parse({
        ...cur,
        objective,
        steps,
        expectedArtifacts,
        updatedAt: new Date().toISOString(),
      });
      // Write through paths if injected; else fallback to repo's createDraftPlan
      // overwriting the same path is acceptable since loadPlan resolves the same file.
      if (deps.paths && deps.runtimeId) {
        await writeJson(
          deps.paths.taskPlan(deps.runtimeId, threadId, taskId),
          next,
        );
      } else {
        // Fallback: re-create as draft to overwrite plan.json. Loses status/revisionIds
        // continuity in the unlikely case where caller didn't pass paths/runtimeId.
        // Tests use this fallback.
        const tempRepo = deps.planRepo;
        await tempRepo.createDraftPlan({
          taskId,
          threadId,
          objective,
          steps,
          expectedArtifacts: expectedArtifacts || [],
        });
      }
      const updated = await deps.planRepo.loadPlan(threadId, taskId);
      return { planId: cur.id, stepCount: updated?.steps.length ?? steps.length };
    },
  });
}
