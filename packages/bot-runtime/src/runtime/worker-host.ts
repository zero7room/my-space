import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { type WorkerPoolOnceInput, runWorkerPoolOnce } from "../executor/worker-pool.js";
import type { LlmClient } from "../llm/client.js";
import { type JobQueue, createJobQueue } from "../repositories/job-queue.js";
import { type PlanRepo, createPlanRepo } from "../repositories/plan-repo.js";
import { type TaskRepo, createTaskRepo } from "../repositories/task-repo.js";
import { type ReleaseLock, acquireInstanceLock } from "../storage/lock.js";
import { type Paths, createPaths } from "../storage/paths.js";
import { type Dispatcher, createDispatcher } from "../tools/dispatcher.js";
import { createDefaultToolRegistry } from "../tools/registry.js";

export type CreateWorkerHostInput = {
  paths: Paths;
  runtimeId: string;
  llm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
  existingLock?: { release: ReleaseLock; skipBoot: boolean };
};

export type WorkerHost = {
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  runOnce(): Promise<Awaited<ReturnType<typeof runWorkerPoolOnce>>>;
  close(): Promise<void>;
};

export async function createWorkerHost(input: CreateWorkerHostInput): Promise<WorkerHost> {
  const release: ReleaseLock =
    input.existingLock?.release ??
    (await acquireInstanceLock(input.paths, input.runtimeId, { role: "worker" }));
  if (!input.existingLock?.skipBoot) {
    await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });
  }

  const taskRepo = createTaskRepo(input.paths, input.runtimeId);
  const planRepo = createPlanRepo(input.paths, input.runtimeId);
  const jobs = createJobQueue(input.paths, input.runtimeId);
  const tools = createDefaultToolRegistry({
    paths: input.paths,
    taskRepo,
    planRepo,
  });
  const dispatcher = createDispatcher({ tools, policies: [] });

  return {
    taskRepo,
    planRepo,
    jobs,
    dispatcher,
    async runOnce() {
      const args: WorkerPoolOnceInput = {
        paths: input.paths,
        runtimeId: input.runtimeId,
        executorIdPrefix: "ex",
        taskRepo,
        planRepo,
        jobs,
        dispatcher,
        llm: input.llm,
        systemPrompt: input.systemPrompt,
        maxSteps: input.maxSteps,
        leaseMs: input.leaseMs,
      };
      return runWorkerPoolOnce(args);
    },
    async close() {
      if (!input.existingLock) await release();
    },
  };
}

void createPaths;
