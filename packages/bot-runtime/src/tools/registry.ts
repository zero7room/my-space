import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { Paths } from "../storage/paths.js";
import { createAskClarificationTool } from "./ask-clarification.js";
import { createConfirmCriticalNodeTool } from "./confirm-critical-node.js";
import { createConfirmPlanTool } from "./confirm-plan.js";
import { createConfirmTaskTool } from "./confirm-task.js";
import { createListDirTool } from "./list-dir.js";
import { createNotifyBoundChannelTool } from "./notify-bound-channel.js";
import { createReadFileTool } from "./read-file.js";
import type { Tool } from "./tool.js";
import { createUpdatePlanTool } from "./update-plan.js";
import { createUpdateTaskTool } from "./update-task.js";
import { createWriteFileTool } from "./write-file.js";

export type RegistryDeps = {
  paths: Paths;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
};

export function createDefaultToolRegistry(deps: RegistryDeps): Tool[] {
  return [
    createReadFileTool(deps.paths),
    createWriteFileTool(deps.paths),
    createListDirTool(deps.paths),
    createAskClarificationTool(),
    createConfirmCriticalNodeTool(),
    createConfirmTaskTool({ taskRepo: deps.taskRepo }),
    createConfirmPlanTool({ planRepo: deps.planRepo }),
    createUpdateTaskTool({ taskRepo: deps.taskRepo }),
    createUpdatePlanTool({ planRepo: deps.planRepo }),
    createNotifyBoundChannelTool(),
  ];
}
