import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createPlanRepo } from "../plan-repo.js";

describe("PlanRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "plr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    th: "th_018f5d20-0000-7000-8000-000000000001",
    tk: "tk_018f5d20-0000-7000-8000-000000000001",
  };

  it("createDraftPlan starts with draft status", async () => {
    const repo = createPlanRepo(createPaths(dataRoot), "rt-1");
    const p = await repo.createDraftPlan({
      taskId: ids.tk,
      threadId: ids.th,
      objective: "ship it",
      steps: [{ id: "s1", title: "first", status: "pending" }],
    });
    expect(p.status).toBe("draft");
  });

  it("supersedeWithRevision archives outputs and writes new revision", async () => {
    const paths = createPaths(dataRoot);
    const repo = createPlanRepo(paths, "rt-1");
    const p = await repo.createDraftPlan({
      taskId: ids.tk,
      threadId: ids.th,
      objective: "v1",
      steps: [],
    });
    await repo.activate(p.id, ids.th, ids.tk);
    const outDir = paths.outputs("rt-1", ids.th, ids.tk);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "draft.md"), "hello");

    const newRev = await repo.supersedeWithRevision(p.id, ids.th, ids.tk, {
      reason: "user pivot",
      sourceMessageId: "msg-1",
      newPlan: {
        objective: "v2",
        steps: [],
        expectedArtifacts: [],
      },
    });

    expect(newRev.status).toBe("active");
    const archived = await readdir(
      paths.outputsArchive("rt-1", ids.th, ids.tk, newRev.id),
    );
    expect(archived).toContain("draft.md");
  });
});
