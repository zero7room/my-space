import { acquireInstanceLock, type ReleaseLock } from "../storage/lock.js";
import { createFencingTokenIssuer, type FencingTokenIssuer } from "../storage/fencing.js";
import type { Paths } from "../storage/paths.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { createGuardDecisionRepo, type GuardDecisionRepo } from "../repositories/guard-decision-repo.js";
import { createJobQueue, type JobQueue } from "../repositories/job-queue.js";
import { createPlanRepo, type PlanRepo } from "../repositories/plan-repo.js";
import { createTaskRepo, type TaskRepo } from "../repositories/task-repo.js";
import { createThreadRepo, type ThreadRepo } from "../repositories/thread-repo.js";
import { createTranscriptRepo, type TranscriptRepo } from "../repositories/transcript-repo.js";
import type { LlmClient } from "../llm/client.js";
import { createMessageGuard, type MessageGuard } from "../guard/message-guard.js";
import { createThreadLoop, type InboundEvent, type ThreadLoop, type ThreadLoopResult } from "../thread-loop/thread-loop.js";

export type CreateMasterHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  systemPrompt: string;
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

export async function createMasterHost(
  input: CreateMasterHostInput,
): Promise<MasterHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "master",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });
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
      const loop = getOrCreateThreadLoop(req.threadId);
      return loop.handleInbound({
        messageId: req.messageId,
        fromUserId: req.fromUserId,
        source: req.source,
        text: req.messageText,
        decision: {
          intent: decision.intent,
          ...(decision.targetTaskId !== undefined && { targetTaskId: decision.targetTaskId }),
          ...(decision.targetPlanId !== undefined && { targetPlanId: decision.targetPlanId }),
          shortCircuited: decision.shortCircuited,
          ruleHits: decision.ruleHits,
          confidence: decision.confidence,
          requiresUserConfirmation: decision.intent === "new_task",
          reason: decision.reason,
        },
        at: req.at,
      });
    },
    async close() {
      await release();
    },
  };
}
