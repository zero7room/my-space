import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { PlanSchema } from "../../schema/plan.js";
import { writeJson } from "../../storage/json-file.js";
import { createPaths } from "../../storage/paths.js";
import { createUpdatePlanTool } from "../update-plan.js";

// Stable UUIDv7-shaped IDs for the tests
const TH_ID = "th_018f5d20-0000-7000-8000-000000000001";
const TK_ID = "tk_018f5d20-0000-7000-8000-000000000002";
const PL_ID = "pl_018f5d20-0000-7000-8000-000000000003";
const RT_ID = "rt-dw-1";

function makeCtx(threadId = TH_ID, taskId = TK_ID) {
  return {
    runtimeId: RT_ID,
    threadId,
    taskId,
    fencingToken: 1,
    now: () => "2026-04-29T00:00:00Z",
  };
}

function makePlan(overrides: Partial<Parameters<typeof PlanSchema.parse>[0]> = {}) {
  return PlanSchema.parse({
    id: PL_ID,
    taskId: TK_ID,
    status: "draft",
    objective: "original objective",
    steps: [{ id: "s1", title: "step one", status: "pending" }],
    expectedArtifacts: ["artifact-a"],
    revisionIds: [],
    createdAt: "2026-04-29T00:00:00Z",
    updatedAt: "2026-04-29T00:00:00Z",
    ...overrides,
  });
}

describe("update_plan — direct-write path (paths + runtimeId injected)", () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await (async () => {
      const { mkdtemp } = await import("node:fs/promises");
      return mkdtemp(path.join(tmpdir(), "upd-direct-"));
    })();
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("happy-path: patches objective and steps in-place, preserves planId and revisionIds", async () => {
    const paths = createPaths(dataRoot);
    const planRepo = createPlanRepo(paths, RT_ID);

    // Pre-populate plan.json directly so we control the ID
    const taskDir = paths.taskDir(RT_ID, TH_ID, TK_ID);
    await mkdir(taskDir, { recursive: true });
    const originalPlan = makePlan();
    await writeJson(paths.taskPlan(RT_ID, TH_ID, TK_ID), originalPlan);

    // Construct with direct-write deps (paths + runtimeId)
    const tool = createUpdatePlanTool({ planRepo, paths, runtimeId: RT_ID });

    const result = (await tool.call(
      {
        threadId: TH_ID,
        taskId: TK_ID,
        objective: "updated objective",
        steps: [
          { id: "s2", title: "new step A", status: "pending" },
          { id: "s3", title: "new step B", status: "pending" },
        ],
        expectedArtifacts: ["artifact-b"],
      },
      { ctx: makeCtx() },
    )) as { planId: string; stepCount: number };

    // Validate return value
    expect(result.planId).toBe(PL_ID);
    expect(result.stepCount).toBe(2);

    // Read plan.json directly from disk to verify the write went through paths
    const raw = JSON.parse(await readFile(paths.taskPlan(RT_ID, TH_ID, TK_ID), "utf8"));
    const written = PlanSchema.parse(raw);

    expect(written.id).toBe(PL_ID); // planId preserved
    expect(written.objective).toBe("updated objective");
    expect(written.steps).toHaveLength(2);
    expect(written.steps[0]?.title).toBe("new step A");
    expect(written.steps[1]?.title).toBe("new step B");
    expect(written.expectedArtifacts).toEqual(["artifact-b"]);
    expect(written.revisionIds).toEqual([]); // preserved from original
    expect(written.taskId).toBe(TK_ID);
    // updatedAt should have been bumped (just confirm it's a valid ISO string)
    expect(() => new Date(written.updatedAt).toISOString()).not.toThrow();
  });

  it("propagates plan-not-found error when plan.json does not exist", async () => {
    const paths = createPaths(dataRoot);
    const planRepo = createPlanRepo(paths, RT_ID);

    // Do NOT pre-populate plan.json — the file is absent

    const tool = createUpdatePlanTool({ planRepo, paths, runtimeId: RT_ID });

    await expect(
      tool.call(
        {
          threadId: TH_ID,
          taskId: TK_ID,
          objective: "anything",
          steps: [{ id: "s1", title: "step", status: "pending" }],
          expectedArtifacts: [],
        },
        { ctx: makeCtx() },
      ),
    ).rejects.toThrow(/plan not found/);
  });

  it("preserves existing fields (status, revisionIds, createdAt) after patch", async () => {
    const paths = createPaths(dataRoot);
    const planRepo = createPlanRepo(paths, RT_ID);

    const taskDir = paths.taskDir(RT_ID, TH_ID, TK_ID);
    await mkdir(taskDir, { recursive: true });
    const originalPlan = makePlan({
      status: "active",
      revisionIds: ["rv_018f5d20-0000-7000-8000-000000000099"],
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    await writeJson(paths.taskPlan(RT_ID, TH_ID, TK_ID), originalPlan);

    const tool = createUpdatePlanTool({ planRepo, paths, runtimeId: RT_ID });

    await tool.call(
      {
        threadId: TH_ID,
        taskId: TK_ID,
        objective: "patched objective",
        steps: [{ id: "s9", title: "only step", status: "in_progress" }],
        expectedArtifacts: [],
      },
      { ctx: makeCtx() },
    );

    const raw = JSON.parse(await readFile(paths.taskPlan(RT_ID, TH_ID, TK_ID), "utf8"));
    const written = PlanSchema.parse(raw);

    expect(written.status).toBe("active"); // status from original preserved
    expect(written.revisionIds).toEqual(["rv_018f5d20-0000-7000-8000-000000000099"]);
    expect(written.createdAt).toBe("2026-01-01T00:00:00Z");
    expect(written.objective).toBe("patched objective");
    expect(written.steps[0]?.id).toBe("s9");
  });
});
