import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { writeJson } from "../../storage/json-file.js";
import { createPaths } from "../../storage/paths.js";
import { handlePlanRevision } from "../plan-revision.js";

describe("handlePlanRevision", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "pr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("issues pause control then archives outputs and creates new revision", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "v1",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await taskRepo.transitionStatus(t.id, "running");
    const outDir = paths.outputs("rt-1", ids.th, t.id);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "old.txt"), "stale");

    const result = await handlePlanRevision({
      paths,
      taskRepo,
      planRepo,
      runtimeId: "rt-1",
      fencingToken: 2000001,
      threadId: ids.th,
      taskId: t.id,
      planId: p.id,
      reason: "user pivot",
      sourceMessageId: "msg-2",
      newPlan: {
        objective: "v2",
        steps: [{ id: "s1", title: "rebuild", status: "pending" }],
        expectedArtifacts: [],
      },
    });

    expect(result.kind).toBe("revised");
    if (result.kind === "revised") {
      const archive = await readdir(
        paths.outputsArchive("rt-1", ids.th, t.id, result.newRevisionId),
      );
      expect(archive).toContain("old.txt");
    }
  });
});

void writeJson; // imported but not directly used in test
