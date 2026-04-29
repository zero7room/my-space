import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createConfirmTaskTool } from "../confirm-task.js";
import { createUpdatePlanTool } from "../update-plan.js";

describe("confirmation and update tools", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ct-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("confirm_task transitions draft → confirmed when ownerUserId matches", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const draft = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    const tool = createConfirmTaskTool({ taskRepo });
    const out = (await tool.call(
      { taskId: draft.id, fromUserId: ids.user },
      { ctx: ctxFor(draft.threadId, draft.id) },
    )) as { status: string };
    expect(out.status).toBe("confirmed");
  });

  it("confirm_task rejects when fromUserId !== ownerUserId", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const draft = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    const tool = createConfirmTaskTool({ taskRepo });
    await expect(
      tool.call(
        { taskId: draft.id, fromUserId: "u_other" },
        { ctx: ctxFor(draft.threadId, draft.id) },
      ),
    ).rejects.toThrow(/owner/);
  });

  it("update_plan replaces step list", async () => {
    const paths = createPaths(dataRoot);
    const planRepo = createPlanRepo(paths, "rt-1");
    const taskRepo = createTaskRepo(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: t.threadId,
      objective: "v1",
      steps: [{ id: "s1", title: "old", status: "pending" }],
    });
    const tool = createUpdatePlanTool({ planRepo });
    const out = (await tool.call(
      {
        threadId: t.threadId,
        taskId: t.id,
        objective: "v1",
        steps: [{ id: "s1", title: "new", status: "pending" }],
      },
      { ctx: ctxFor(t.threadId, t.id) },
    )) as { stepCount: number };
    expect(out.stepCount).toBe(1);
    const reloaded = await planRepo.loadPlan(t.threadId, t.id);
    expect(reloaded?.steps[0]?.title).toBe("new");
  });
});

function ctxFor(threadId: string, taskId: string) {
  return {
    runtimeId: "rt-1",
    threadId,
    taskId,
    fencingToken: 1,
    now: () => "2026-04-28T00:00:00Z",
  };
}
