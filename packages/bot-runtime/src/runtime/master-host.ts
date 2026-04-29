import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { type MessageGuard, createMessageGuard } from "../guard/message-guard.js";
import type { LlmClient } from "../llm/client.js";
import {
  type GuardDecisionRepo,
  createGuardDecisionRepo,
} from "../repositories/guard-decision-repo.js";
import { type JobQueue, createJobQueue } from "../repositories/job-queue.js";
import { type PlanRepo, createPlanRepo } from "../repositories/plan-repo.js";
import { type TaskRepo, createTaskRepo } from "../repositories/task-repo.js";
import { type ThreadRepo, createThreadRepo } from "../repositories/thread-repo.js";
import { type TranscriptRepo, createTranscriptRepo } from "../repositories/transcript-repo.js";
import { type FencingTokenIssuer, createFencingTokenIssuer } from "../storage/fencing.js";
import { type ReleaseLock, acquireInstanceLock } from "../storage/lock.js";
import type { Paths } from "../storage/paths.js";
import {
  type InboundEvent,
  type ThreadLoop,
  type ThreadLoopResult,
  createThreadLoop,
} from "../thread-loop/thread-loop.js";

export type CreateMasterHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  systemPrompt: string;
  existingLock?: { release: ReleaseLock; skipBoot: boolean };
};

export type MasterHost = {
  threadRepo: ThreadRepo;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  transcript: TranscriptRepo;
  guardRepo: GuardDecisionRepo;
  guard: MessageGuard;
  ingestInbound(input: IngestInboundInput): Promise<ThreadLoopResult>;
  getOrCreateThreadLoop(threadId: string): ThreadLoop;
  fencing: FencingTokenIssuer;
  close(): Promise<void>;
};

export type IngestInboundInput = {
  threadId: string;
  messageId: string;
  fromUserId: string;
  source: InboundEvent["source"];
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  messageText: string;
  at: string;
};

export async function createMasterHost(input: CreateMasterHostInput): Promise<MasterHost> {
  const release: ReleaseLock =
    input.existingLock?.release ??
    (await acquireInstanceLock(input.paths, input.runtimeId, { role: "master" }));
  if (!input.existingLock?.skipBoot) {
    await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });
  }
  const fencing = await createFencingTokenIssuer(input.paths, input.runtimeId);

  const threadRepo = createThreadRepo(input.paths, input.runtimeId);
  const taskRepo = createTaskRepo(input.paths, input.runtimeId);
  const planRepo = createPlanRepo(input.paths, input.runtimeId);
  const jobs = createJobQueue(input.paths, input.runtimeId);
  const transcript = createTranscriptRepo(input.paths, input.runtimeId);
  const guardRepo = createGuardDecisionRepo(input.paths, input.runtimeId);
  const guard = createMessageGuard({ llm: input.guardLlm });

  const loops = new Map<string, ThreadLoop>();

  function getOrCreateThreadLoop(threadId: string): ThreadLoop {
    const existing = loops.get(threadId);
    if (existing) return existing;
    const loop = createThreadLoop({
      runtimeId: input.runtimeId,
      threadId,
      threadRepo,
      taskRepo,
      planRepo,
      jobQueue: jobs,
      transcript,
      guardRepo,
      llm: input.draftLlm,
      issueFencingToken: () => fencing.issue(),
    });
    loops.set(threadId, loop);
    return loop;
  }

  return {
    threadRepo,
    taskRepo,
    planRepo,
    jobs,
    transcript,
    guardRepo,
    guard,
    fencing,
    getOrCreateThreadLoop,
    async ingestInbound(req) {
      const thread = await threadRepo.load(req.threadId);
      const status = thread?.status ?? "chatting";
      const decision = await guard.classify({
        source: req.source,
        bound: req.bound,
        mentionsBot: req.mentionsBot,
        replyToBotMessage: req.replyToBotMessage,
        slashCommand: req.slashCommand,
        threadStatus: status,
        messageText: req.messageText,
        pendingTaskId: thread?.draftTaskId,
        pendingPlanId: thread?.draftPlanId,
      });

      // When a /confirm slash command is present and the thread has a pending draft,
      // inject the pending IDs as targetTaskId/targetPlanId so the thread-loop can
      // dispatch the confirmation even when the guard or LLM does not return them.
      const effectiveTargetTaskId =
        decision.targetTaskId ?? (req.slashCommand === "confirm" ? thread?.draftTaskId : undefined);
      const effectiveTargetPlanId =
        decision.targetPlanId ?? (req.slashCommand === "confirm" ? thread?.draftPlanId : undefined);
      const effectiveIntent =
        req.slashCommand === "confirm" && effectiveTargetTaskId ? "confirm_task" : decision.intent;

      const loop = getOrCreateThreadLoop(req.threadId);
      return loop.handleInbound({
        messageId: req.messageId,
        fromUserId: req.fromUserId,
        source: req.source,
        text: req.messageText,
        decision: {
          intent: effectiveIntent,
          ...(effectiveTargetTaskId !== undefined && { targetTaskId: effectiveTargetTaskId }),
          ...(effectiveTargetPlanId !== undefined && { targetPlanId: effectiveTargetPlanId }),
          shortCircuited: decision.shortCircuited,
          ruleHits: decision.ruleHits,
          confidence: decision.confidence,
          requiresUserConfirmation: effectiveIntent === "new_task",
          reason: decision.reason,
        },
        at: req.at,
      });
    },
    async close() {
      if (!input.existingLock) await release();
    },
  };
}
