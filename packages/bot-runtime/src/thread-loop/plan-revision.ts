import { writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { PlanStep } from "../schema/plan.js";
import type { TaskControl } from "../schema/job.js";

export type HandlePlanRevisionInput = {
  paths: Paths;
  runtimeId: string;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  fencingToken: number;
  threadId: string;
  taskId: string;
  planId: string;
  reason: string;
  sourceMessageId: string;
  newPlan: {
    objective: string;
    steps: PlanStep[];
    expectedArtifacts: string[];
  };
};

export type HandlePlanRevisionResult =
  | { kind: "revised"; newRevisionId: string }
  | { kind: "ignored"; reason: string };

export async function handlePlanRevision(
  input: HandlePlanRevisionInput,
): Promise<HandlePlanRevisionResult> {
  const t = await input.taskRepo.load(input.taskId);
  if (!t) throw new Error(`task ${input.taskId} not found`);
  if (t.status !== "running" && t.status !== "blocked" && t.status !== "queued") {
    return { kind: "ignored", reason: `task in non-revisable status ${t.status}` };
  }

  const pauseControl: TaskControl = {
    signal: "pause",
    signalAt: new Date().toISOString(),
    signalFencingToken: input.fencingToken,
  };
  await writeJson(
    input.paths.taskControl(input.runtimeId, input.threadId, input.taskId),
    pauseControl,
  );

  await input.taskRepo.transitionStatus(input.taskId, "changing").catch(() => {
    /* if illegal transition we still proceed; tolerate via .catch */
  });

  const newRev = await input.planRepo.supersedeWithRevision(
    input.planId,
    input.threadId,
    input.taskId,
    {
      reason: input.reason,
      sourceMessageId: input.sourceMessageId,
      newPlan: input.newPlan,
    },
  );

  await input.taskRepo.update(input.taskId, {
    activePlanRevisionId: newRev.id,
    archivedRevisionIds: [...t.archivedRevisionIds, ...newRev.archivedArtifactPaths.map(() => `archive-${newRev.id}`)],
  });

  await input.taskRepo.transitionStatus(input.taskId, "queued");

  const reviseControl: TaskControl = {
    signal: "revise",
    revisionId: newRev.id,
    signalAt: new Date().toISOString(),
    signalFencingToken: input.fencingToken,
  };
  await writeJson(
    input.paths.taskControl(input.runtimeId, input.threadId, input.taskId),
    reviseControl,
  );

  return { kind: "revised", newRevisionId: newRev.id };
}
