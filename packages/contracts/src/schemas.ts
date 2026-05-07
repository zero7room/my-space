/**
 * Zod schemas for durable records.
 *
 * Conventions:
 *   - All durable records are `.strict()` to catch typo'd fields at the boundary.
 *   - Timestamps are ISO-8601 strings (`z.string().datetime({ offset: true })`).
 *   - IDs are validated as `<prefix>_<21 chars>`. We accept any prefix here so
 *     repositories can do prefix-specific assertions in the call sites that need
 *     it (saves N near-duplicate schemas).
 *   - Schema-level transition validity is NOT enforced here — see `states.ts`
 *     transition guards. Schemas only verify shape.
 */
import { z } from 'zod';

import { RUNTIME_ID_REGEX } from './ids.js';
import {
  type ChannelBindingState,
  type OutboundJobState,
  type PlanState,
  type RetryDispositionState,
  type TaskState,
  type TeamState,
  type TeammateState,
  type TeamWorkItemState,
  type ThreadState,
  type TransitionDecision,
  CHANNEL_BINDING_TRANSITIONS,
  OUTBOUND_JOB_TRANSITIONS,
  PLAN_TRANSITIONS,
  RETRY_TRANSITIONS,
  TASK_TRANSITIONS,
  TEAMMATE_TRANSITIONS,
  TEAM_TRANSITIONS,
  TEAM_WORK_ITEM_TRANSITIONS,
  THREAD_TRANSITIONS,
} from './states.js';

// ---------- Primitives -----------------------------------------------------

export const isoTimestamp = z.string().datetime({ offset: true });

export const idString = z
  .string()
  .regex(/^[a-z]+_[A-Za-z0-9]{21}$/, 'invalid id format');

export const runtimeIdSchema = z
  .string()
  .regex(RUNTIME_ID_REGEX, 'invalid runtimeId');

// ---------- Enums (canonical strings — schemas mirror states.ts) -----------

export const taskStatusSchema: z.ZodType<TaskState> = z.enum([
  'draft',
  'confirmed',
  'queued',
  'running',
  'awaiting_critical_node',
  'blocked',
  'paused',
  'changing',
  'completed',
  'failed',
  'cancelled',
]);

export const planStatusSchema: z.ZodType<PlanState> = z.enum([
  'draft',
  'pending_confirmation',
  'active',
  'revising',
  'superseded',
  'completed',
]);

export const threadStatusSchema: z.ZodType<ThreadState> = z.enum([
  'chatting',
  'planning',
  'waiting_confirmation',
  'working',
  'blocked',
  'paused',
  'awaiting_critical_node',
  'idle',
]);

export const channelBindingStatusSchema: z.ZodType<ChannelBindingState> =
  z.enum(['binding', 'bound', 'unbinding', 'failed', 'disabled']);

export const outboundJobStatusSchema: z.ZodType<OutboundJobState> = z.enum([
  'pending',
  'running',
  'succeeded',
  'failed',
  'dead',
]);

export const teamStatusSchema: z.ZodType<TeamState> = z.enum([
  'forming',
  'active',
  'finishing',
  'completed',
  'failed',
  'cancelled',
]);

export const teammateStatusSchema: z.ZodType<TeammateState> = z.enum([
  'spawning',
  'idle',
  'working',
  'paused',
  'awaiting_critical_node',
  'finished',
  'failed',
  'cancelled',
]);

export const teamWorkItemStatusSchema: z.ZodType<TeamWorkItemState> = z.enum([
  'available',
  'claimed',
  'completed',
  'failed',
  'cancelled',
]);

export const retryDispositionSchema: z.ZodType<RetryDispositionState> = z.enum([
  'none',
  'pending',
  'scheduled',
  'exhausted',
  'reset_by_plan_update',
  'manual_requested',
]);

export const failureClassSchema = z.enum([
  'transient_error',
  'assertion_error',
  'permission_error',
  'user_cancelled',
  'budget_overflow',
]);
export type FailureClass = z.infer<typeof failureClassSchema>;

export const blockedReasonSchema = z.enum([
  'retry_pending',
  'retry_exhausted',
  'awaiting_user_action',
  'non_idempotent_tool_in_flight',
]);
export type BlockedReason = z.infer<typeof blockedReasonSchema>;

export const planStepStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'blocked',
  'skipped',
  'superseded',
  'failed',
]);
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>;

export const intentSchema = z.enum([
  'chat',
  'new_task',
  'task_update',
  'plan_update',
  'confirm_task',
  'confirm_plan',
  'progress_query',
  'pause_task',
  'resume_task',
  'cancel_task',
  'irrelevant',
]);
export type Intent = z.infer<typeof intentSchema>;

export const riskClassSchema = z.enum(['low', 'medium', 'high']);
export type RiskClass = z.infer<typeof riskClassSchema>;

// ---------- User & TaskList -------------------------------------------------

export const userSchema = z
  .object({
    id: idString,
    displayName: z.string().min(1),
    channelIdentities: z.object({
      feishu: z
        .object({
          openId: z.string().min(1),
          tenantKey: z.string().optional(),
        })
        .optional(),
      slack: z
        .object({ userId: z.string().min(1), teamId: z.string().min(1) })
        .optional(),
      email: z.string().email().optional(),
    }),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type User = z.infer<typeof userSchema>;

export const taskListSchema = z
  .object({
    id: idString,
    threadId: idString,
    orderedTaskIds: z.array(idString),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type TaskList = z.infer<typeof taskListSchema>;

// ---------- ChangeRecord ----------------------------------------------------

export const changeRecordSchema = z
  .object({
    id: idString,
    taskId: idString,
    oldPlanRevisionId: idString,
    newPlanRevisionId: idString,
    triggerMessageId: idString,
    triggerUserId: idString,
    guardDecisionId: idString,
    userOriginalText: z.string(),
    llmSummary: z.string(),
    archivedArtifactPaths: z.array(z.string()),
    createdAt: isoTimestamp,
  })
  .strict();
export type ChangeRecord = z.infer<typeof changeRecordSchema>;

// ---------- ArtifactRecord --------------------------------------------------

export const artifactRecordSchema = z
  .object({
    id: idString,
    taskId: idString,
    planRevisionId: idString,
    relativePath: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    mimeType: z.string().min(1),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    status: z.enum(['active', 'archived']),
    archivedAt: isoTimestamp.optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type ArtifactRecord = z.infer<typeof artifactRecordSchema>;

// ---------- SkillManifest ---------------------------------------------------

export const skillManifestSchema = z
  .object({
    name: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    description: z.string().min(1).max(200),
    whenToUse: z.string().min(1),
    allowedTools: z.array(z.string()),
    agent: z.string().optional(),
    persona: z.string().optional(),
    workflow: z.string().optional(),
    outputContract: z.string().optional(),
    version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/),
    riskClass: riskClassSchema,
  })
  .strict()
  .refine((s) => Boolean(s.agent) !== Boolean(s.persona) || (s.agent && s.persona), {
    message: 'one of agent or persona is required',
    path: ['agent'],
  });
export type SkillManifest = z.infer<typeof skillManifestSchema>;

export const skillLoadErrorClassSchema = z.enum([
  'schema_invalid',
  'yaml_parse',
  'name_conflict',
]);
export type SkillLoadErrorClass = z.infer<typeof skillLoadErrorClassSchema>;

export const skillsLoadErrorSchema = z
  .object({
    kind: z.literal('skills_load_error'),
    skillName: z.string().nullable(),
    skillPath: z.string(),
    errorClass: skillLoadErrorClassSchema,
    reason: z.string(),
    field: z.string().nullable(),
    at: isoTimestamp,
  })
  .strict();
export type SkillsLoadError = z.infer<typeof skillsLoadErrorSchema>;

export const skillsFallbackToCacheSchema = z
  .object({
    kind: z.literal('skills_fallback_to_cache'),
    skillName: z.string(),
    cacheTimestamp: isoTimestamp,
    at: isoTimestamp,
  })
  .strict();
export type SkillsFallbackToCache = z.infer<typeof skillsFallbackToCacheSchema>;

// ---------- Thread ----------------------------------------------------------

export const threadSchema = z
  .object({
    id: idString,
    ownerUserId: idString,
    title: z.string(),
    status: threadStatusSchema,
    taskListId: idString,
    activeTaskId: idString.optional(),
    draftTaskId: idString.optional(),
    draftPlanId: idString.optional(),
    channelBindingIds: z.array(idString),
    contextSummary: z.string().optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type Thread = z.infer<typeof threadSchema>;

// ---------- Task ------------------------------------------------------------

export const taskBudgetSchema = z
  .object({
    maxDurationMs: z.number().int().positive().optional(),
    maxTokens: z.number().int().positive().optional(),
    maxSubagents: z.number().int().positive().optional(),
    maxCostUsd: z.number().nonnegative().optional(),
  })
  .strict();
export type TaskBudget = z.infer<typeof taskBudgetSchema>;

export const taskRetryStateSchema = z
  .object({
    attemptCount: z.number().int().nonnegative(),
    maxRetries: z.number().int().nonnegative(),
    failureClass: failureClassSchema.optional(),
    lastFailureAt: isoTimestamp.optional(),
    lastFailureReason: z.string().optional(),
    nextRetryAt: isoTimestamp.optional(),
    lastEventId: idString.optional(),
  })
  .strict()
  .refine((r) => r.attemptCount <= r.maxRetries + 1, {
    message: 'attemptCount must not exceed maxRetries + 1 (current attempt)',
    path: ['attemptCount'],
  });
export type TaskRetryState = z.infer<typeof taskRetryStateSchema>;

export const taskBaseSchema = z
  .object({
    id: idString,
    threadId: idString,
    ownerUserId: idString,
    confirmedByUserId: idString.optional(),
    title: z.string(),
    description: z.string(),
    status: taskStatusSchema,
    sourceMessageIds: z.array(idString),
    planId: idString.optional(),
    activePlanRevisionId: idString.optional(),
    assignedRuntimeId: runtimeIdSchema.optional(),
    assignedExecutorId: idString.optional(),
    budget: taskBudgetSchema.optional(),
    retry: taskRetryStateSchema.optional(),
    artifactIds: z.array(idString),
    changeRecordIds: z.array(idString),
    archivedRevisionIds: z.array(idString),
    blockedReason: blockedReasonSchema.optional(),
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    lastUserSignalAt: isoTimestamp.optional(),
    lastUserSignalKind: z
      .enum(['cancel', 'pause', 'resume', 'revise'])
      .optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();

export const taskSchema = taskBaseSchema
  .refine(
    (t) =>
      (t.status === 'blocked' || t.status === 'failed'
        ? t.blockedReason !== undefined
        : true),
    {
      message: 'blockedReason is required when status is blocked or failed',
      path: ['blockedReason'],
    },
  )
  .refine(
    (t) =>
      t.confirmedByUserId === undefined ||
      t.confirmedByUserId === t.ownerUserId,
    {
      message: 'confirmedByUserId must equal ownerUserId',
      path: ['confirmedByUserId'],
    },
  );
export type Task = z.infer<typeof taskSchema>;

// ---------- Plan / PlanRevision --------------------------------------------

export const planStepSchema = z
  .object({
    id: idString,
    title: z.string().min(1),
    description: z.string().optional(),
    status: planStepStatusSchema,
    startedAt: isoTimestamp.optional(),
    completedAt: isoTimestamp.optional(),
    evidence: z.array(z.string()).optional(),
  })
  .strict();
export type PlanStep = z.infer<typeof planStepSchema>;

export const planSchema = z
  .object({
    id: idString,
    taskId: idString,
    status: planStatusSchema,
    objective: z.string(),
    steps: z.array(planStepSchema),
    expectedArtifacts: z.array(z.string()),
    revisionIds: z.array(idString),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;

export const planRevisionSchema = z
  .object({
    id: idString,
    planId: idString,
    taskId: idString,
    status: z.enum(['active', 'superseded']),
    fullPlan: planSchema,
    reason: z.string(),
    sourceMessageId: idString,
    archivedArtifactPaths: z.array(z.string()),
    supersededAt: isoTimestamp.optional(),
    createdAt: isoTimestamp,
  })
  .strict();
export type PlanRevision = z.infer<typeof planRevisionSchema>;

// ---------- GuardDecision ---------------------------------------------------

export const guardDecisionSchema = z
  .object({
    id: idString,
    messageId: idString,
    threadId: idString,
    fromUserId: idString.optional(),
    source: z.string(),
    intent: intentSchema,
    targetTaskId: idString.optional(),
    targetPlanId: idString.optional(),
    shortCircuited: z.boolean(),
    ruleHits: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    requiresUserConfirmation: z.boolean(),
    reason: z.string(),
    createdAt: isoTimestamp,
  })
  .strict();
export type GuardDecision = z.infer<typeof guardDecisionSchema>;

// ---------- ChannelConfig / Binding / Inbound / Job ------------------------

export const channelConfigSchema = z
  .object({
    provider: z.string().min(1),
    enabled: z.boolean(),
    ingress: z
      .object({
        webhookEnabled: z.boolean().optional(),
        longConnectionEnabled: z.boolean().optional(),
      })
      .strict(),
    publicFields: z.record(z.union([z.string(), z.boolean(), z.number()])),
    secretRefs: z.record(z.string()),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type ChannelConfig = z.infer<typeof channelConfigSchema>;

export const channelConfigViewSchema = z
  .object({
    provider: z.string(),
    enabled: z.boolean(),
    ingress: z.object({
      webhookEnabled: z.boolean().optional(),
      longConnectionEnabled: z.boolean().optional(),
    }),
    publicFields: z.record(z.union([z.string(), z.boolean(), z.number()])),
    hasSecret: z.record(z.boolean()),
    updatedAt: isoTimestamp,
  })
  .strict();
export type ChannelConfigView = z.infer<typeof channelConfigViewSchema>;

export const channelBindingSchema = z
  .object({
    id: idString,
    threadId: idString,
    provider: z.string().min(1),
    externalConversationId: z.string().optional(),
    externalConversationType: z.enum(['dm', 'group', 'topic']),
    status: channelBindingStatusSchema,
    createdBy: z.enum(['client', 'guardian', 'runtime', 'admin']),
    enabled: z.boolean(),
    notifyDefault: z.boolean(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type ChannelBinding = z.infer<typeof channelBindingSchema>;

export const channelInboundEventSchema = z
  .object({
    id: idString,
    provider: z.string(),
    externalEventId: z.string(),
    externalMessageId: z.string().optional(),
    status: z.enum(['received', 'processed', 'skipped', 'failed']),
    payloadRef: z.string(),
    createdAt: isoTimestamp,
    processedAt: isoTimestamp.optional(),
  })
  .strict();
export type ChannelInboundEvent = z.infer<typeof channelInboundEventSchema>;

export const channelJobSchema = z
  .object({
    id: idString,
    provider: z.string(),
    type: z.enum([
      'create_conversation',
      'delete_conversation',
      'send_message',
    ]),
    status: outboundJobStatusSchema,
    dedupeKey: z.string().optional(),
    payload: z.record(z.unknown()),
    result: z.record(z.unknown()).optional(),
    attemptCount: z.number().int().nonnegative(),
    lastError: z.string().optional(),
    runAfter: isoTimestamp,
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type ChannelJob = z.infer<typeof channelJobSchema>;

// ---------- ChatClaim (channel uniqueness index) ---------------------------

export const chatClaimSchema = z
  .object({
    id: idString,
    provider: z.string(),
    externalConversationId: z.string(),
    threadId: idString,
    bindingId: idString,
    createdAt: isoTimestamp,
  })
  .strict();
export type ChatClaim = z.infer<typeof chatClaimSchema>;

// ---------- CriticalNodePolicy ---------------------------------------------

export const nodeMatcherSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('tool'),
      toolName: z.string(),
      argMatch: z.record(z.unknown()).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('skill'),
      riskClass: riskClassSchema.optional(),
      skillName: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('external_io'),
      direction: z.literal('outbound'),
      provider: z.string().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('filesystem'),
      op: z.enum(['delete', 'overwrite']),
      minCount: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('budget_overflow'),
      dim: z.enum(['time', 'tokens', 'subagents', 'cost']),
    })
    .strict(),
  z
    .object({ kind: z.literal('out_of_scope'), planRevisionId: idString })
    .strict(),
]);
export type NodeMatcher = z.infer<typeof nodeMatcherSchema>;

export const criticalNodePolicySchema = z
  .object({
    id: idString,
    scope: z.enum(['global', 'user', 'thread', 'skill']),
    matcher: nodeMatcherSchema,
    action: z.enum(['require_approval', 'block', 'log_only']),
    ownerUserId: idString,
    enabled: z.boolean(),
    createdAt: isoTimestamp,
  })
  .strict();
export type CriticalNodePolicy = z.infer<typeof criticalNodePolicySchema>;

// ---------- RuntimeRegistration --------------------------------------------

export const runtimeRegistrationSchema = z
  .object({
    runtimeId: runtimeIdSchema,
    serverId: z.string(),
    role: z.enum(['master', 'worker', 'hybrid']),
    workspaceRoot: z.string(),
    capabilities: z.array(z.string()),
    enabledSkills: z.array(z.string()),
    maxConcurrentTasks: z.number().int().positive(),
    heartbeatAt: isoTimestamp,
  })
  .strict();
export type RuntimeRegistration = z.infer<typeof runtimeRegistrationSchema>;

// ---------- Team / Roster / WorkItem / Message / Teammate ------------------

export const teamBudgetSchema = z
  .object({
    maxDurationMs: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    maxTeammates: z.number().int().min(1).max(8),
    maxWorkItems: z.number().int().positive(),
    maxMessages: z.number().int().positive(),
  })
  .strict();
export type TeamBudget = z.infer<typeof teamBudgetSchema>;

export const teamSummaryRefSchema = z
  .object({
    outcome: z.enum(['completed', 'failed', 'cancelled']),
    summaryText: z.string(),
    harvestedOutputIds: z.array(idString),
  })
  .strict();
export type TeamSummaryRef = z.infer<typeof teamSummaryRefSchema>;

export const teamRosterSlotSchema = z
  .object({
    slotId: idString,
    slotName: z.string().min(1),
    persona: z.string().optional(),
    skillAllowlist: z.array(z.string()).optional(),
    preferredRoles: z.array(z.string()).optional(),
    maxConcurrentClaims: z.number().int().min(1),
    teammateId: idString.optional(),
    status: z.enum(['pending', 'spawned', 'idle', 'working', 'finished', 'failed']),
  })
  .strict();
export type TeamRosterSlot = z.infer<typeof teamRosterSlotSchema>;

export const teamSchema = z
  .object({
    id: idString,
    parentTaskId: idString,
    parentExecutorId: idString,
    threadId: idString,
    status: teamStatusSchema,
    roster: z.array(teamRosterSlotSchema),
    budget: teamBudgetSchema,
    summary: teamSummaryRefSchema.optional(),
    schemaVersion: z.literal(1),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type Team = z.infer<typeof teamSchema>;

export const teamWorkItemSchema = z
  .object({
    id: idString,
    teamId: idString,
    description: z.string(),
    preferredRole: z.string().optional(),
    priority: z.number().int(),
    status: teamWorkItemStatusSchema,
    claimedByTeammateId: idString.optional(),
    claimedAt: isoTimestamp.optional(),
    claimLeaseExpireAt: isoTimestamp.optional(),
    claimFencingToken: z.number().int().nonnegative().optional(),
    attemptCount: z.number().int().nonnegative(),
    maxReclaims: z.number().int().nonnegative(),
    resultRef: z.string().optional(),
    failureClass: z
      .enum([
        'transient_error',
        'assertion_error',
        'permission_error',
        'cancelled',
      ])
      .optional(),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type TeamWorkItem = z.infer<typeof teamWorkItemSchema>;

export const teamMessageSchema = z
  .object({
    id: idString,
    teamId: idString,
    from: z.union([
      z.literal('lead'),
      z.literal('system'),
      z.object({ teammateId: idString }).strict(),
    ]),
    to: z.union([
      z.literal('broadcast'),
      z.literal('lead'),
      z.object({ teammateId: idString }).strict(),
    ]),
    kind: z.enum(['chat', 'handoff', 'directive', 'status', 'result_link']),
    content: z.string(),
    referencedWorkItemIds: z.array(idString).optional(),
    at: isoTimestamp,
  })
  .strict();
export type TeamMessage = z.infer<typeof teamMessageSchema>;

export const teammateBudgetSchema = z
  .object({
    maxDurationMs: z.number().int().positive(),
    maxTokens: z.number().int().positive(),
    maxSubagents: z.number().int().nonnegative(),
  })
  .strict();
export type TeammateBudget = z.infer<typeof teammateBudgetSchema>;

export const teammateSchema = z
  .object({
    id: idString,
    teamId: idString,
    slotId: idString,
    runtimeActorId: idString,
    status: teammateStatusSchema,
    currentWorkItemId: idString.optional(),
    lastMessageCursor: idString.optional(),
    budget: teammateBudgetSchema,
    summary: z.string().optional(),
    schemaVersion: z.literal(1),
    createdAt: isoTimestamp,
    updatedAt: isoTimestamp,
  })
  .strict();
export type Teammate = z.infer<typeof teammateSchema>;

// ---------- Lease primitive ------------------------------------------------

export const leaseSchema = z
  .object({
    id: idString,
    resource: z.string().min(1),
    holderId: idString,
    fencingToken: z.number().int().nonnegative(),
    expireAt: isoTimestamp,
    createdAt: isoTimestamp,
  })
  .strict();
export type Lease = z.infer<typeof leaseSchema>;

// ---------- File-level transaction record ----------------------------------

export const fileTransactionSchema = z
  .object({
    id: idString,
    status: z.enum(['pending', 'committed', 'rolledback']),
    operations: z.array(
      z
        .object({
          kind: z.enum(['write', 'append', 'rename', 'delete']),
          path: z.string(),
          backupPath: z.string().optional(),
        })
        .strict(),
    ),
    eventIds: z.array(idString),
    createdAt: isoTimestamp,
    completedAt: isoTimestamp.optional(),
  })
  .strict();
export type FileTransaction = z.infer<typeof fileTransactionSchema>;

// ---------- TaskControl (signal channel from ThreadLoop to Executor) ------

export const taskControlSchema = z
  .object({
    taskId: idString,
    pendingSignals: z.array(
      z
        .object({
          kind: z.enum([
            'cancel',
            'pause',
            'resume',
            'revise',
            'critical_node_decision',
            'manual_retry',
            'skip',
          ]),
          messageId: idString,
          userId: idString,
          payload: z.record(z.unknown()).optional(),
          createdAt: isoTimestamp,
        })
        .strict(),
    ),
    updatedAt: isoTimestamp,
  })
  .strict();
export type TaskControl = z.infer<typeof taskControlSchema>;

// ---------- Higher-level transition guards (Phase 1 step 4) ---------------

export interface TaskTransitionContext {
  /** The new failureClass when transitioning out of `running`. */
  failureClass?: FailureClass;
  /** Signals an automatic retry path is being taken. */
  autoRetry?: boolean;
  /** Signals user-issued manual retry. */
  manualRetry?: boolean;
  /** Signals a plan_update reset of retry counters. */
  planUpdateReset?: boolean;
  /** When transitioning to blocked or failed, the reason. */
  blockedReason?: BlockedReason;
}

/**
 * `failed → queued` is structurally allowed, but only along three controlled
 * paths. This guard rejects ad-hoc requeues.
 */
export function canTransitionTask(
  from: TaskState,
  to: TaskState,
  ctx: TaskTransitionContext = {},
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  if (!TASK_TRANSITIONS[from].includes(to)) {
    return { ok: false, reason: `Task cannot transition from ${from} to ${to}` };
  }
  if (from === 'failed' && to === 'queued') {
    if (!(ctx.autoRetry || ctx.manualRetry || ctx.planUpdateReset)) {
      return {
        ok: false,
        reason: 'failed→queued requires autoRetry, manualRetry, or planUpdateReset',
      };
    }
  }
  if ((to === 'blocked' || to === 'failed') && !ctx.blockedReason) {
    return {
      ok: false,
      reason: 'transition to blocked or failed requires blockedReason',
    };
  }
  return { ok: true };
}

/**
 * Apply a validated task transition and return a new Task with timestamps,
 * blockedReason, and retry state updated as required.
 */
export function applyTaskTransition(
  task: Task,
  to: TaskState,
  ctx: TaskTransitionContext & { now: string } = { now: new Date().toISOString() },
): Task {
  const decision = canTransitionTask(task.status, to, ctx);
  if (!decision.ok) throw new Error(decision.reason);
  const next: Task = {
    ...task,
    status: to,
    updatedAt: ctx.now,
    blockedReason:
      to === 'blocked' || to === 'failed' ? ctx.blockedReason : undefined,
  };
  return next;
}

export function canTransitionTeam(from: TeamState, to: TeamState): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return TEAM_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `Team cannot transition from ${from} to ${to}` };
}

export function canTransitionTeammate(
  from: TeammateState,
  to: TeammateState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return TEAMMATE_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `Teammate cannot transition from ${from} to ${to}` };
}

export function canTransitionWorkItem(
  from: TeamWorkItemState,
  to: TeamWorkItemState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return TEAM_WORK_ITEM_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `TeamWorkItem cannot transition from ${from} to ${to}` };
}

export function canTransitionPlan(from: PlanState, to: PlanState): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return PLAN_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `Plan cannot transition from ${from} to ${to}` };
}

export function canTransitionThread(
  from: ThreadState,
  to: ThreadState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return THREAD_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `Thread cannot transition from ${from} to ${to}` };
}

export function canTransitionChannelBinding(
  from: ChannelBindingState,
  to: ChannelBindingState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return CHANNEL_BINDING_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : {
        ok: false,
        reason: `ChannelBinding cannot transition from ${from} to ${to}`,
      };
}

export function canTransitionOutboundJob(
  from: OutboundJobState,
  to: OutboundJobState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return OUTBOUND_JOB_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : {
        ok: false,
        reason: `OutboundJob cannot transition from ${from} to ${to}`,
      };
}

export function canTransitionRetry(
  from: RetryDispositionState,
  to: RetryDispositionState,
): TransitionDecision {
  if (from === to) return { ok: false, reason: 'self-transition' };
  return RETRY_TRANSITIONS[from].includes(to)
    ? { ok: true }
    : { ok: false, reason: `Retry cannot transition from ${from} to ${to}` };
}
