import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../json-file.js";
import { createPaths } from "../paths.js";
import { recoverStaleLockedJobs } from "../recovery.js";

describe("recovery — stale locked jobs", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rec-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("moves expired locked job to failed/ and returns its id", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.jobsDir("rt-1", "locked"), { recursive: true });
    const expired = {
      id: "job-expired",
      type: "execute_task",
      taskId: "tk-1",
      threadId: "th-1",
      planRevisionId: "rv-1",
      assignedAt: new Date().toISOString(),
      fencingToken: 1,
      lockHolder: "rt-old",
      leaseExpireAt: new Date(Date.now() - 1000).toISOString(),
    };
    await writeJson(paths.jobFile("rt-1", "locked", "job-expired"), expired);

    const moved = await recoverStaleLockedJobs(paths, "rt-1");
    expect(moved).toContain("job-expired");
    expect(await readdir(paths.jobsDir("rt-1", "locked"))).not.toContain("job-expired.json");
    expect(await readdir(paths.jobsDir("rt-1", "failed"))).toContain("job-expired.json");
  });

  it("keeps non-expired locked jobs in place", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.jobsDir("rt-1", "locked"), { recursive: true });
    const fresh = {
      id: "job-fresh",
      type: "execute_task",
      taskId: "tk-2",
      threadId: "th-1",
      planRevisionId: "rv-1",
      assignedAt: new Date().toISOString(),
      fencingToken: 2,
      lockHolder: "rt-1",
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await writeJson(paths.jobFile("rt-1", "locked", "job-fresh"), fresh);

    const moved = await recoverStaleLockedJobs(paths, "rt-1");
    expect(moved).toEqual([]);
    expect(await readdir(paths.jobsDir("rt-1", "locked"))).toContain("job-fresh.json");
  });
});
