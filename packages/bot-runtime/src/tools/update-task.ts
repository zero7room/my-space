import { z } from "zod";
import type { TaskRepo } from "../repositories/task-repo.js";
import { type Tool, defineTool } from "./tool.js";

export function createUpdateTaskTool(deps: { taskRepo: TaskRepo }): Tool {
  return defineTool({
    name: "update_task",
    description: "Update the title or description of a task draft (no status change).",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
    output: z.object({ taskId: z.string() }),
    async call({ taskId, title, description }) {
      const patch: { title?: string; description?: string } = {};
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      await deps.taskRepo.update(taskId, patch);
      return { taskId };
    },
  });
}
