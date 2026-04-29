import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createStubLlmClient } from "../../llm/client.js";
import { createWorkerHost } from "../worker-host.js";

describe("WorkerHost", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "wh-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("draws one pending job and runs Executor", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobs = createJobQueue(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "x",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await jobs.enqueueExecuteTask({
      taskId: t.id,
      threadId: ids.th,
      planRevisionId: p.id,
      fencingToken: 1000001,
    });
    await mkdir(paths.workspace("rt-1", ids.th, t.id), { recursive: true });

    const llm = createStubLlmClient({}, { kind: "text", text: "done" });
    const host = await createWorkerHost({
      paths,
      runtimeId: "rt-1",
      llm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });
    const result = await host.runOnce();
    expect(result?.outcome).toBe("completed");
    await host.close();
  });
});
