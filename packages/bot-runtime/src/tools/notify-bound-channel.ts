// packages/bot-runtime/src/tools/notify-bound-channel.ts
import { z } from "zod";
import type { ChannelOutboundJobQueue } from "../channel/outbound-job-queue.js";
import type { ChannelBindingRepo } from "../repositories/channel-binding-repo.js";
import { type NotifyTarget, resolveNotifyTargets } from "./_notify-target.js";
import { type Tool, defineTool } from "./tool.js";

export const NotifyTargetSchema = z.union([
  z.literal("all"),
  z.object({ provider: z.string() }),
  z.object({ bindingId: z.string() }),
]);
export type { NotifyTarget };

export type CreateNotifyBoundChannelToolInput = {
  bindingRepo: ChannelBindingRepo;
  queue: ChannelOutboundJobQueue;
  threadId: string;
};

export function createNotifyBoundChannelTool(deps: CreateNotifyBoundChannelToolInput): Tool {
  return defineTool({
    name: "notify_bound_channel",
    description:
      "Notify the channel(s) bound to the current thread. Enqueues a ChannelJob for each matching binding.",
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
      jobIds: z.array(z.string()).optional(),
    }),
    async call(args) {
      const bindings = await deps.bindingRepo.listForThread(deps.threadId);
      if (bindings.length === 0) {
        return { status: "binding_unavailable" as const, reason: "no bindings" };
      }
      const matched = resolveNotifyTargets(args.target as NotifyTarget, bindings);
      if (matched.length === 0) {
        if (bindings.some((b) => b.status === "binding")) {
          return { status: "binding_in_progress" as const };
        }
        if (bindings.some((b) => b.status === "failed")) {
          return { status: "binding_failed" as const };
        }
        return { status: "binding_unavailable" as const };
      }
      const jobIds: string[] = [];
      for (const b of matched) {
        if (!b.externalConversationId) continue;
        const job = await deps.queue.enqueueSendMessage({
          provider: b.provider,
          payload: {
            externalConversationId: b.externalConversationId,
            text: args.message,
            importance: args.importance,
          },
        });
        jobIds.push(job.id);
      }
      return { status: "enqueued" as const, jobIds };
    },
  });
}
