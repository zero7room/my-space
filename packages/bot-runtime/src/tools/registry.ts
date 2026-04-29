import { z } from "zod";
import type { ChannelOutboundJobQueue } from "../channel/outbound-job-queue.js";
import type { ChannelBindingRepo } from "../repositories/channel-binding-repo.js";
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
import { type Tool, defineTool } from "./tool.js";
import { createUpdatePlanTool } from "./update-plan.js";
import { createUpdateTaskTool } from "./update-task.js";
import { createWriteFileTool } from "./write-file.js";

export type RegistryDeps = {
  paths: Paths;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  channelDeps?: {
    bindingRepo: ChannelBindingRepo;
    queue: ChannelOutboundJobQueue;
    threadId: string;
  };
};

function createLegacyStubNotifyBoundChannelTool(): Tool {
  return defineTool({
    name: "notify_bound_channel",
    description:
      "Notify the channel(s) bound to the current thread. Channel deps not provided — returns binding_unavailable.",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({
      target: z.union([
        z.literal("all"),
        z.object({ provider: z.string() }),
        z.object({ bindingId: z.string() }),
      ]),
      message: z.string(),
      importance: z.enum(["info", "milestone", "alert"]),
      reason: z.string().optional(),
    }),
    output: z.object({
      status: z.enum([
        "binding_unavailable",
        "binding_in_progress",
        "binding_failed",
        "enqueued",
        "sent",
      ]),
      reason: z.string().optional(),
      jobIds: z.array(z.string()).optional(),
    }),
    async call(_args) {
      return { status: "binding_unavailable" as const, reason: "channel deps not provided" };
    },
  });
}

export function createDefaultToolRegistry(deps: RegistryDeps): Tool[] {
  const notifyTool = deps.channelDeps
    ? createNotifyBoundChannelTool(deps.channelDeps)
    : createLegacyStubNotifyBoundChannelTool();

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
    notifyTool,
  ];
}
