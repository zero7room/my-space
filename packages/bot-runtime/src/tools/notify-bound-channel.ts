import { z } from "zod";
import { type Tool, defineTool } from "./tool.js";

export const NotifyTargetSchema = z.union([
  z.literal("all"),
  z.object({ provider: z.string() }),
  z.object({ bindingId: z.string() }),
]);
export type NotifyTarget = z.infer<typeof NotifyTargetSchema>;

export function createNotifyBoundChannelTool(): Tool {
  return defineTool({
    name: "notify_bound_channel",
    description:
      "Notify the channel(s) bound to the current thread. In Plan 1 this is a stub that returns binding_unavailable; full implementation arrives in Plan 2.",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({
      target: NotifyTargetSchema,
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
    }),
    async call(args) {
      return {
        status: "binding_unavailable" as const,
        reason: "channel subsystem not implemented in Plan 1",
      };
    },
  });
}
