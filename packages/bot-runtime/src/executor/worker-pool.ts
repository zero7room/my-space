import type { LlmClient } from "../llm/client.js";
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import type { Dispatcher } from "../tools/dispatcher.js";
import { runExecutor, type RunExecutorResult } from "./executor.js";

export type WorkerPoolOnceInput = {
  paths: Paths;
  runtimeId: string;
  executorIdPrefix: string;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  llm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
};

export async function runWorkerPoolOnce(
  input: WorkerPoolOnceInput,
): Promise<RunExecutorResult | null> {
  const leased = await input.jobs.leaseNext({
    lockHolder: `${input.executorIdPrefix}_${newId("exec")}`,
    leaseMs: input.leaseMs,
  });
  if (!leased) return null;
  let result: RunExecutorResult;
  try {
    result = await runExecutor({
      paths: input.paths,
      runtimeId: input.runtimeId,
      executorId: leased.lockHolder ?? "exec-?",
      taskRepo: input.taskRepo,
      planRepo: input.planRepo,
      jobs: input.jobs,
      dispatcher: input.dispatcher,
      llm: input.llm,
      systemPrompt: input.systemPrompt,
      taskId: leased.taskId,
      maxSteps: input.maxSteps,
    });
  } catch (err) {
    await input.jobs.fail(leased.id, (err as Error).message);
    return { outcome: "failed", error: (err as Error).message };
  }

  if (
    result.outcome === "completed" ||
    result.outcome === "failed" ||
    result.outcome === "cancelled"
  ) {
    const completion: { outcome: "failed" | "completed" | "cancelled"; error?: string } = {
      outcome:
        result.outcome === "completed"
          ? "completed"
          : result.outcome === "cancelled"
            ? "cancelled"
            : "failed",
    };
    if (result.outcome === "failed") {
      completion.error = result.error;
    }
    await input.jobs.complete(leased.id, completion);
  } else {
    /* awaiting_critical_node / blocked: keep job in locked, ThreadLoop will revise/cancel */
  }
  return result;
}
