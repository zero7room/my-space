import type { LlmClient } from "../llm/client.js";
import type { GuardDecisionRepo } from "../repositories/guard-decision-repo.js";
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { TranscriptRepo } from "../repositories/transcript-repo.js";
import type { GuardIntent, GuardSource } from "../schema/guard-decision.js";
import { newId } from "../storage/ids.js";
import { handleConfirmation } from "./confirm-gate.js";
import { buildDraft } from "./draft-builder.js";

export type ThreadLoopDeps = {
  runtimeId: string;
  threadId: string;
  threadRepo: ThreadRepo;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobQueue: JobQueue;
  transcript: TranscriptRepo;
  guardRepo: GuardDecisionRepo;
  llm: LlmClient;
  issueFencingToken: () => number;
};

export type InboundEvent = {
  messageId: string;
  fromUserId: string;
  source: GuardSource;
  text: string;
  decision: {
    intent: GuardIntent;
    targetTaskId?: string;
    targetPlanId?: string;
    shortCircuited: boolean;
    ruleHits: string[];
    confidence: number;
    requiresUserConfirmation: boolean;
    reason: string;
  };
  at: string;
};

export type ThreadLoopResult =
  | { kind: "ignored"; reason: string }
  | { kind: "draft_created"; taskId: string; planId: string }
  | { kind: "dispatched"; taskId: string; jobId: string }
  | { kind: "noop"; intent: GuardIntent };

export type ThreadLoop = {
  handleInbound(event: InboundEvent): Promise<ThreadLoopResult>;
};

export function createThreadLoop(deps: ThreadLoopDeps): ThreadLoop {
  return {
    async handleInbound(event) {
      await deps.transcript.append(deps.threadId, {
        kind: "user_message",
        messageId: event.messageId,
        text: event.text,
        at: event.at,
      });
      await deps.guardRepo.append({
        id: newId("guard"),
        messageId: event.messageId,
        threadId: deps.threadId,
        fromUserId: event.fromUserId,
        source: event.source,
        intent: event.decision.intent,
        targetTaskId: event.decision.targetTaskId,
        targetPlanId: event.decision.targetPlanId,
        shortCircuited: event.decision.shortCircuited,
        ruleHits: event.decision.ruleHits,
        confidence: event.decision.confidence,
        requiresUserConfirmation: event.decision.requiresUserConfirmation,
        reason: event.decision.reason,
        createdAt: event.at,
      });

      switch (event.decision.intent) {
        case "irrelevant":
        case "chat":
          return { kind: "ignored", reason: event.decision.intent };
        case "new_task": {
          const thread = await deps.threadRepo.load(deps.threadId);
          if (!thread) throw new Error("thread not found");
          const { task, plan } = await buildDraft({
            llm: deps.llm,
            taskRepo: deps.taskRepo,
            planRepo: deps.planRepo,
            threadId: deps.threadId,
            ownerUserId: thread.ownerUserId,
            sourceMessageIds: [event.messageId],
            userMessage: event.text,
          });
          await deps.threadRepo.update(deps.threadId, {
            status: "waiting_confirmation",
            draftTaskId: task.id,
            draftPlanId: plan.id,
          });
          return { kind: "draft_created", taskId: task.id, planId: plan.id };
        }
        case "confirm_task": {
          const taskId = event.decision.targetTaskId;
          const planId = event.decision.targetPlanId;
          if (!taskId || !planId) {
            return { kind: "noop", intent: "confirm_task" };
          }
          const result = await handleConfirmation({
            taskRepo: deps.taskRepo,
            planRepo: deps.planRepo,
            jobQueue: deps.jobQueue,
            fencingToken: deps.issueFencingToken(),
            taskId,
            planId,
            fromUserId: event.fromUserId,
          });
          if (result.status === "dispatched") {
            await deps.threadRepo.update(deps.threadId, {
              status: "working",
              activeTaskId: taskId,
            });
            return { kind: "dispatched", taskId, jobId: result.jobId };
          }
          return { kind: "noop", intent: "confirm_task" };
        }
        default:
          return { kind: "noop", intent: event.decision.intent };
      }
    },
  };
}
