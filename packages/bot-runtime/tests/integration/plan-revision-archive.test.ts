import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepo } from "../../src/repositories/plan-repo.js";
import { newId } from "../../src/storage/ids.js";
import { createPaths } from "../../src/storage/paths.js";

/**
 * Integration tests for plan-revision artifact archiving.
 *
 * The archive flow lives entirely in PlanRepo.supersedeWithRevision:
 *  1. It generates a new revisionId.
 *  2. It calls moveDirContents(outputs/, outputs/_archive/<revisionId>/).
 *  3. It writes two plan-revision JSON files (the superseded snapshot and the
 *     new active revision).
 *
 * NOTE: The archive dir key is the NEW revisionId (the one returned in the
 * PlanRevision result), not the old plan ID. This matches paths.outputsArchive
 * which takes (runtimeId, threadId, taskId, revisionId).
 */

const RUNTIME_ID = "rt_test";

describe("plan revision archives old artifacts", () => {
  let dataRoot: string;

  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "pra-"));
  });

  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("moves files from outputs/ into outputs/_archive/<revisionId>/", async () => {
    const paths = createPaths(dataRoot);
    const repo = createPlanRepo(paths, RUNTIME_ID);

    const taskId = newId("tk");
    const threadId = newId("th");

    // 1. Create and activate a plan (supersedeWithRevision requires an active plan).
    const plan = await repo.createDraftPlan({
      taskId,
      threadId,
      objective: "v1 objective",
      steps: [{ id: newId("tk"), title: "initial step", status: "pending" }],
      expectedArtifacts: ["draft.md"],
    });
    await repo.activate(plan.id, threadId, taskId);

    // 2. Write some output files to simulate work done under v1.
    const outputsDir = paths.outputs(RUNTIME_ID, threadId, taskId);
    await mkdir(outputsDir, { recursive: true });
    await writeFile(path.join(outputsDir, "draft.md"), "v1 content");
    await writeFile(path.join(outputsDir, "notes.txt"), "some notes");

    // 3. Supersede the plan with a revision.
    const newRev = await repo.supersedeWithRevision(plan.id, threadId, taskId, {
      reason: "user requested pivot",
      sourceMessageId: "msg_001",
      newPlan: {
        objective: "v2 objective",
        steps: [{ id: newId("tk"), title: "revised step", status: "pending" }],
        expectedArtifacts: [],
      },
    });

    // 4. Verify new revision JSON was written and is active.
    expect(newRev.status).toBe("active");
    expect(newRev.id).toBeTruthy();

    // 5. Verify the superseded snapshot was written too (plan-revisions/<revId>-prev.json).
    const revisions = await repo.listRevisions(threadId, taskId);
    const supersededRev = revisions.find((r) => r.status === "superseded");
    expect(supersededRev).toBeDefined();
    expect(supersededRev!.fullPlan.objective).toBe("v1 objective");

    // 6. Verify the output files were moved to the archive dir.
    // The archive dir uses the NEW revisionId (not old plan id).
    const archiveDir = paths.outputsArchive(RUNTIME_ID, threadId, taskId, newRev.id);
    const archived = await readdir(archiveDir);
    expect(archived).toContain("draft.md");
    expect(archived).toContain("notes.txt");

    // 7. Verify the original outputs dir no longer contains the non-archive files.
    const remainingOutputs = await readdir(outputsDir);
    // Only _archive subdir should remain; original files were moved.
    const nonArchive = remainingOutputs.filter((e) => e !== "_archive");
    expect(nonArchive).toHaveLength(0);

    // 8. Verify the superseded snapshot captured the archived artifact paths.
    expect(supersededRev!.archivedArtifactPaths).toContain("draft.md");
    expect(supersededRev!.archivedArtifactPaths).toContain("notes.txt");
  });

  it("succeeds and creates a revision even when outputs/ does not exist", async () => {
    const paths = createPaths(dataRoot);
    const repo = createPlanRepo(paths, RUNTIME_ID);

    const taskId = newId("tk");
    const threadId = newId("th");

    const plan = await repo.createDraftPlan({
      taskId,
      threadId,
      objective: "empty outputs plan",
      steps: [],
      expectedArtifacts: [],
    });
    await repo.activate(plan.id, threadId, taskId);

    // No outputs/ dir created — simulate task that produced no artifacts.
    const newRev = await repo.supersedeWithRevision(plan.id, threadId, taskId, {
      reason: "empty pivot",
      sourceMessageId: "msg_002",
      newPlan: {
        objective: "v2 empty",
        steps: [],
        expectedArtifacts: [],
      },
    });

    expect(newRev.status).toBe("active");

    // The superseded snapshot should have no archived artifact paths.
    const revisions = await repo.listRevisions(threadId, taskId);
    const supersededRev = revisions.find((r) => r.status === "superseded");
    expect(supersededRev).toBeDefined();
    expect(supersededRev!.archivedArtifactPaths).toHaveLength(0);

    // moveDirContents always calls mkdir(dst) before checking the source, so the
    // archive dir is created even when there are no files to move (empty outputs/).
    // Assert the actual behavior: archive dir exists but is empty.
    const archiveDir = paths.outputsArchive(RUNTIME_ID, threadId, taskId, newRev.id);
    const archiveContents = await readdir(archiveDir);
    expect(archiveContents).toHaveLength(0);
  });
});
