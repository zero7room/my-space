import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../json-file.js";
import { createPaths } from "../paths.js";
import {
  cleanupRecoveredTombstones,
  cleanupStaleDedupe,
  markStaleRunningTasks,
} from "../recovery.js";

describe("recovery — task and dedupe sweeps", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rec2-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("markStaleRunningTasks flips status running → blocked when no active job", async () => {
    const paths = createPaths(dataRoot);
    const taskJson = paths.taskJson("rt-1", "th-1", "tk-1");
    await writeJson(taskJson, {
      id: "tk-1",
      threadId: "th-1",
      status: "running",
    });
    const flipped = await markStaleRunningTasks(paths, "rt-1");
    expect(flipped).toContain("tk-1");
  });

  it("cleanupStaleDedupe removes entries older than retention", async () => {
    const paths = createPaths(dataRoot);
    const dir = paths.jobsDir("rt-1", "dedupe");
    await mkdir(dir, { recursive: true });
    const oldFile = path.join(dir, "old-key");
    await writeFile(oldFile, "x");
    const past = Date.now() - 1000 * 60 * 60 * 24 * 31;
    const fs = await import("node:fs/promises");
    await fs.utimes(oldFile, past / 1000, past / 1000);

    const cleaned = await cleanupStaleDedupe(paths, "rt-1", 30);
    expect(cleaned).toContain("old-key");
  });

  it("cleanupRecoveredTombstones removes .recovered files", async () => {
    const paths = createPaths(dataRoot);
    const lockedDir = paths.jobsDir("rt-1", "locked");
    await mkdir(lockedDir, { recursive: true });
    await writeFile(path.join(lockedDir, "j1.json.recovered"), "{}");
    const cleaned = await cleanupRecoveredTombstones(paths, "rt-1");
    expect(cleaned).toBe(1);
    expect(await readdir(lockedDir)).not.toContain("j1.json.recovered");
  });
});
