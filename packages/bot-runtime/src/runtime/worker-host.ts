import { acquireInstanceLock, type ReleaseLock } from "../storage/lock.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { createJobQueue, type JobQueue } from "../repositories/job-queue.js";
import { createPlanRepo, type PlanRepo } from "../repositories/plan-repo.js";
import { createTaskRepo, type TaskRepo } from "../repositories/task-repo.js";
import { createPaths, type Paths } from "../storage/paths.js";
import { createDispatcher, type Dispatcher } from "../tools/dispatcher.js";
import { createDefaultToolRegistry } from "../tools/registry.js";
import { runWorkerPoolOnce, type WorkerPoolOnceInput } from "../executor/worker-pool.js";
import type { LlmClient } from "../llm/client.js";

export type CreateWorkerHostInput = {
  paths: Paths;
  runtimeId: string;
  llm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
};

export type WorkerHost = {
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  runOnce(): Promise<Awaited<ReturnType<typeof runWorkerPoolOnce>>>;
  close(): Promise<void>;
};

export async function createWorkerHost(
  input: CreateWorkerHostInput,
): Promise<WorkerHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "worker",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });

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
      await release();
    },
  };
}

void createPaths;
