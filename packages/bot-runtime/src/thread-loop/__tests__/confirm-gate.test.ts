import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { handleConfirmation } from "../confirm-gate.js";

describe("confirm-gate handleConfirmation", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "cg-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  async function setup() {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobQueue = createJobQueue(paths, "rt-1");
    const task = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    const plan = await planRepo.createDraftPlan({
      taskId: task.id,
      threadId: ids.th,
      objective: "v1",
      steps: [],
    });
    return { paths, taskRepo, planRepo, jobQueue, task, plan };
  }

  it("happy path: draft → confirmed → queued and ExecuteTaskJob enqueued", async () => {
    const { taskRepo, planRepo, jobQueue, task, plan } = await setup();
    const result = await handleConfirmation({
      taskRepo,
      planRepo,
      jobQueue,
      fencingToken: 1000001,
      taskId: task.id,
      planId: plan.id,
      fromUserId: ids.user,
    });
    expect(result.status).toBe("dispatched");
    const after = await taskRepo.load(task.id);
    expect(after?.status).toBe("queued");
  });

  it("rejects when fromUserId !== ownerUserId", async () => {
    const { taskRepo, planRepo, jobQueue, task, plan } = await setup();
    await expect(
      handleConfirmation({
        taskRepo,
        planRepo,
        jobQueue,
        fencingToken: 1000001,
        taskId: task.id,
        planId: plan.id,
        fromUserId: "u_other",
      }),
    ).rejects.toThrow(/owner/);
  });

  it("idempotent: calling twice on already confirmed task returns 'already_dispatched'", async () => {
    const { taskRepo, planRepo, jobQueue, task, plan } = await setup();
    await handleConfirmation({
      taskRepo,
      planRepo,
      jobQueue,
      fencingToken: 1000001,
      taskId: task.id,
      planId: plan.id,
      fromUserId: ids.user,
    });
    const second = await handleConfirmation({
      taskRepo,
      planRepo,
      jobQueue,
      fencingToken: 1000002,
      taskId: task.id,
      planId: plan.id,
      fromUserId: ids.user,
    });
    expect(second.status).toBe("already_dispatched");
  });
});
