import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";

export type HandleConfirmationInput = {
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobQueue: JobQueue;
  fencingToken: number;
  taskId: string;
  planId: string;
  fromUserId: string;
};

export type HandleConfirmationResult =
  | { status: "dispatched"; jobId: string }
  | { status: "already_dispatched" };

export async function handleConfirmation(
  input: HandleConfirmationInput,
): Promise<HandleConfirmationResult> {
  const task = await input.taskRepo.load(input.taskId);
  if (!task) throw new Error(`task ${input.taskId} not found`);
  if (task.ownerUserId !== input.fromUserId) {
    throw new Error(`confirmation rejected: fromUserId !== owner (${task.ownerUserId})`);
  }

  if (task.status === "queued" || task.status === "running" || task.status === "completed") {
    return { status: "already_dispatched" };
  }

  await input.taskRepo.transitionStatus(input.taskId, "confirmed", {
    confirmedByUserId: input.fromUserId,
    planId: input.planId,
  });
  const activatedPlan = await input.planRepo.activate(input.planId, task.threadId, task.id);
  const queued = await input.taskRepo.transitionStatus(input.taskId, "queued");
  void queued;

  const job = await input.jobQueue.enqueueExecuteTask({
    taskId: input.taskId,
    threadId: task.threadId,
    planRevisionId: activatedPlan.revisionIds.at(-1) ?? activatedPlan.id,
    fencingToken: input.fencingToken,
    budget: task.budget,
  });

  return { status: "dispatched", jobId: job.id };
}
