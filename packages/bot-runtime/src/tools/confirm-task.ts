import { z } from "zod";
import type { TaskRepo } from "../repositories/task-repo.js";
import { type Tool, defineTool } from "./tool.js";

export function createConfirmTaskTool(deps: { taskRepo: TaskRepo }): Tool {
  return defineTool({
    name: "confirm_task",
    description: "Confirm a draft task. fromUserId must equal task.ownerUserId.",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      taskId: z.string(),
      fromUserId: z.string(),
    }),
    output: z.object({ taskId: z.string(), status: z.string() }),
    async call({ taskId, fromUserId }) {
      const t = await deps.taskRepo.load(taskId);
      if (!t) throw new Error(`task ${taskId} not found`);
      if (t.ownerUserId !== fromUserId) {
        throw new Error(`confirm_task rejected: fromUserId !== task owner (${t.ownerUserId})`);
      }
      const next = await deps.taskRepo.transitionStatus(taskId, "confirmed", {
        confirmedByUserId: fromUserId,
      });
      return { taskId: next.id, status: next.status };
    },
  });
}
