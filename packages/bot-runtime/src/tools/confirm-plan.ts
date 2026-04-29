import { z } from "zod";
import type { PlanRepo } from "../repositories/plan-repo.js";
import { type Tool, defineTool } from "./tool.js";

export function createConfirmPlanTool(deps: { planRepo: PlanRepo }): Tool {
  return defineTool({
    name: "confirm_plan",
    description: "Activate a draft plan so the task can enter the queue.",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      threadId: z.string(),
      taskId: z.string(),
      planId: z.string(),
    }),
    output: z.object({ planId: z.string(), status: z.string() }),
    async call({ threadId, taskId, planId }) {
      const next = await deps.planRepo.activate(planId, threadId, taskId);
      return { planId: next.id, status: next.status };
    },
  });
}
