/**
 * Request / response DTOs for HTTP endpoints. Frontend, runtime API, and tests
 * MUST import these instead of defining ad-hoc shapes.
 */
import { z } from 'zod';

import {
  artifactRecordSchema,
  channelBindingSchema,
  channelConfigViewSchema,
  channelConfigSchema,
  criticalNodePolicySchema,
  guardDecisionSchema,
  idString,
  isoTimestamp,
  planSchema,
  planRevisionSchema,
  taskBaseSchema,
  taskRetryStateSchema,
  teamSchema,
  teamMessageSchema,
  teamWorkItemSchema,
  teammateSchema,
  threadSchema,
  userSchema,
} from '../schemas.js';

// --- /api/users/me ---

export const meResponseSchema = z.object({ user: userSchema });
export type MeResponse = z.infer<typeof meResponseSchema>;

// --- threads ---

export const createThreadRequestSchema = z
  .object({
    title: z.string().optional(),
    initialMessage: z.string().optional(),
  })
  .strict();
export type CreateThreadRequest = z.infer<typeof createThreadRequestSchema>;

export const threadDtoSchema = threadSchema.extend({
  activeTaskTitle: z.string().optional(),
  unreadCount: z.number().int().nonnegative().default(0),
});
export type ThreadDto = z.infer<typeof threadDtoSchema>;

export const threadListResponseSchema = z.object({
  threads: z.array(threadDtoSchema),
  nextCursor: z.string().optional(),
});
export type ThreadListResponse = z.infer<typeof threadListResponseSchema>;

export const postMessageRequestSchema = z
  .object({
    text: z.string().min(1),
    clientMessageId: z.string().optional(),
  })
  .strict();
export type PostMessageRequest = z.infer<typeof postMessageRequestSchema>;

export const postMessageResponseSchema = z.object({
  messageId: idString,
  guardDecision: guardDecisionSchema.optional(),
});
export type PostMessageResponse = z.infer<typeof postMessageResponseSchema>;

export const ackRequestSchema = z
  .object({ lastEventId: idString })
  .strict();
export type AckRequest = z.infer<typeof ackRequestSchema>;

// --- tasks ---

export const taskDtoSchema = taskBaseSchema.extend({
  threadTitle: z.string().optional(),
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const taskActionResponseSchema = z.object({
  task: taskDtoSchema,
  warning: z.string().optional(),
});
export type TaskActionResponse = z.infer<typeof taskActionResponseSchema>;

export const retryHistoryEntrySchema = z
  .object({
    eventId: idString,
    at: isoTimestamp,
    attemptCount: z.number().int().nonnegative(),
    failureClass: z.string().optional(),
    summary: z.string(),
    state: taskRetryStateSchema.optional(),
  })
  .strict();
export const retryHistoryResponseSchema = z.object({
  taskId: idString,
  entries: z.array(retryHistoryEntrySchema),
});
export type RetryHistoryResponse = z.infer<typeof retryHistoryResponseSchema>;

export const planListResponseSchema = z.object({
  plan: planSchema,
  revisions: z.array(planRevisionSchema),
});
export type PlanListResponse = z.infer<typeof planListResponseSchema>;

// --- artifacts ---

export const artifactGetResponseSchema = z.object({
  artifact: artifactRecordSchema,
  downloadUrl: z.string().url().optional(),
});
export type ArtifactGetResponse = z.infer<typeof artifactGetResponseSchema>;

// --- channels ---

export const channelConfigsResponseSchema = z.object({
  configs: z.array(channelConfigViewSchema),
});
export type ChannelConfigsResponse = z.infer<
  typeof channelConfigsResponseSchema
>;

export const putChannelConfigRequestSchema = channelConfigSchema
  .pick({ enabled: true, ingress: true, publicFields: true })
  .extend({
    /** Caller supplies redacted secret material; runtime stores the resolved ref. */
    secretInputs: z.record(z.string()).optional(),
  });
export type PutChannelConfigRequest = z.infer<
  typeof putChannelConfigRequestSchema
>;

export const channelBindingListResponseSchema = z.object({
  bindings: z.array(channelBindingSchema),
});
export type ChannelBindingListResponse = z.infer<
  typeof channelBindingListResponseSchema
>;

export const createChannelBindingRequestSchema = z
  .object({
    threadId: idString,
    provider: z.string().min(1),
    externalConversationId: z.string().optional(),
    externalConversationType: z.enum(['dm', 'group', 'topic']),
    notifyDefault: z.boolean().default(true),
  })
  .strict();
export type CreateChannelBindingRequest = z.infer<
  typeof createChannelBindingRequestSchema
>;

// --- critical node policies ---

export const policyListResponseSchema = z.object({
  policies: z.array(criticalNodePolicySchema),
});
export type PolicyListResponse = z.infer<typeof policyListResponseSchema>;

export const createPolicyRequestSchema = criticalNodePolicySchema.omit({
  id: true,
  createdAt: true,
});
export type CreatePolicyRequest = z.infer<typeof createPolicyRequestSchema>;

export const updatePolicyRequestSchema = criticalNodePolicySchema
  .partial()
  .omit({ id: true, createdAt: true })
  .strict();
export type UpdatePolicyRequest = z.infer<typeof updatePolicyRequestSchema>;

// --- skills ---

export const skillsLoadStatusResponseSchema = z.object({
  loaded: z.array(
    z.object({
      name: z.string(),
      version: z.string(),
      riskClass: z.enum(['low', 'medium', 'high']),
    }),
  ),
  errors: z.array(
    z.object({
      skillPath: z.string(),
      reason: z.string(),
      field: z.string().nullable(),
      at: isoTimestamp,
    }),
  ),
});
export type SkillsLoadStatusResponse = z.infer<
  typeof skillsLoadStatusResponseSchema
>;

// --- runtime ---

export const runtimeHealthResponseSchema = z.object({
  runtimeId: z.string(),
  startedAt: isoTimestamp,
  uptimeMs: z.number().int().nonnegative(),
  activeTaskCount: z.number().int().nonnegative(),
  pendingOutboundJobs: z.number().int().nonnegative(),
});
export type RuntimeHealthResponse = z.infer<typeof runtimeHealthResponseSchema>;

// --- teams ---

export const teamListResponseSchema = z.object({ teams: z.array(teamSchema) });
export type TeamListResponse = z.infer<typeof teamListResponseSchema>;

export const teamWorkItemsResponseSchema = z.object({
  workItems: z.array(teamWorkItemSchema),
});
export type TeamWorkItemsResponse = z.infer<typeof teamWorkItemsResponseSchema>;

export const teamMessagesResponseSchema = z.object({
  messages: z.array(teamMessageSchema),
  nextCursor: z.string().optional(),
});
export type TeamMessagesResponse = z.infer<typeof teamMessagesResponseSchema>;

export const teammatesResponseSchema = z.object({
  teammates: z.array(teammateSchema),
});
export type TeammatesResponse = z.infer<typeof teammatesResponseSchema>;

// --- shared error envelope ---

export const errorResponseSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.unknown()).optional(),
    }),
  })
  .strict();
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
