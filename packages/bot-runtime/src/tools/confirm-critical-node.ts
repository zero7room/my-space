import { z } from "zod";
import {
  InterruptSignalSchema,
  type InterruptSignal,
} from "./ask-clarification.js";
import { defineTool, type Tool } from "./tool.js";

export function createConfirmCriticalNodeTool(): Tool {
  return defineTool({
    name: "confirm_critical_node",
    description:
      "Pause execution at a critical node policy hit and request user approval.",
    readOnly: true,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      policyId: z.string(),
      action: z.enum(["require_approval", "block", "log_only"]),
      summary: z.string(),
    }),
    output: InterruptSignalSchema,
    async call({ policyId, action, summary }, { ctx }): Promise<InterruptSignal> {
      return {
        kind: "interrupt",
        reason: "critical_node",
        policyId,
        action,
        summary,
        at: ctx.now(),
      };
    },
  });
}
