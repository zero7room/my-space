import { z } from "zod";
import { type Tool, defineTool } from "./tool.js";

export const InterruptSignalSchema = z.discriminatedUnion("reason", [
  z.object({
    kind: z.literal("interrupt"),
    reason: z.literal("ask_clarification"),
    question: z.string(),
    at: z.string(),
  }),
  z.object({
    kind: z.literal("interrupt"),
    reason: z.literal("critical_node"),
    policyId: z.string(),
    action: z.enum(["require_approval", "block", "log_only"]),
    summary: z.string(),
    at: z.string(),
  }),
]);
export type InterruptSignal = z.infer<typeof InterruptSignalSchema>;

export function createAskClarificationTool(): Tool {
  return defineTool({
    name: "ask_clarification",
    description: "Pause execution and request more information from the user.",
    readOnly: true,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({ question: z.string() }),
    output: InterruptSignalSchema,
    async call({ question }, { ctx }): Promise<InterruptSignal> {
      return {
        kind: "interrupt",
        reason: "ask_clarification",
        question,
        at: ctx.now(),
      };
    },
  });
}
