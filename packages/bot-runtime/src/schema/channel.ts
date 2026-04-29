import { z } from "zod";
import { ThreadIdSchema } from "./thread.js";

export const ProviderSchema = z.enum(["feishu", "slack", "wecom", "email", "custom"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const ChannelConfigSchema = z.object({
  provider: ProviderSchema,
  enabled: z.boolean(),
  ingress: z.object({
    webhookEnabled: z.boolean().optional(),
    longConnectionEnabled: z.boolean().optional(),
  }),
  publicFields: z.record(z.union([z.string(), z.boolean(), z.number()])),
  secretRefs: z.record(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const ChannelBindingSchema = z.object({
  id: z.string(),
  threadId: ThreadIdSchema,
  provider: z.string(),
  externalConversationId: z.string().optional(),
  externalConversationType: z.enum(["dm", "group", "topic"]),
  status: z.enum(["binding", "bound", "unbinding", "failed", "disabled"]),
  createdBy: z.enum(["client", "guardian", "runtime", "admin"]),
  enabled: z.boolean(),
  notifyDefault: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChannelBinding = z.infer<typeof ChannelBindingSchema>;

export const ChannelInboundEventSchema = z.object({
  id: z.string(),
  provider: z.string(),
  externalEventId: z.string(),
  externalMessageId: z.string().optional(),
  status: z.enum(["received", "processed", "skipped", "failed"]),
  payloadRef: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  processedAt: z.string().datetime({ offset: true }).optional(),
});
export type ChannelInboundEvent = z.infer<typeof ChannelInboundEventSchema>;

export const ChannelJobSchema = z.object({
  id: z.string(),
  provider: z.string(),
  type: z.enum(["create_conversation", "delete_conversation", "send_message"]),
  status: z.enum(["pending", "running", "succeeded", "failed", "dead"]),
  dedupeKey: z.string().optional(),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  runAfter: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChannelJob = z.infer<typeof ChannelJobSchema>;
