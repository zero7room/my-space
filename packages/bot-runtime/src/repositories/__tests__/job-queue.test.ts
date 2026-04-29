import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createJobQueue } from "../job-queue.js";

describe("JobQueue", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "jq-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    th: "th_018f5d20-0000-7000-8000-000000000001",
    tk: "tk_018f5d20-0000-7000-8000-000000000001",
  };

  it("enqueueExecuteTask writes pending file", async () => {
    const q = createJobQueue(createPaths(dataRoot), "rt-1");
    const job = await q.enqueueExecuteTask({
      taskId: ids.tk,
      threadId: ids.th,
      planRevisionId: "rv-1",
      fencingToken: 1000001,
    });
    expect(job.id).toMatch(/^job_/);
    const pending = await readdir(createPaths(dataRoot).jobsDir("rt-1", "pending"));
    expect(pending.some((f) => f === `${job.id}.json`)).toBe(true);
  });

  it("leaseNext moves pending → locked, sets leaseExpireAt", async () => {
    const q = createJobQueue(createPaths(dataRoot), "rt-1");
    await q.enqueueExecuteTask({
      taskId: ids.tk,
      threadId: ids.th,
      planRevisionId: "rv-1",
      fencingToken: 1000001,
    });
    const leased = await q.leaseNext({
      lockHolder: "exec-1",
      leaseMs: 60_000,
    });
    expect(leased?.lockHolder).toBe("exec-1");
    expect(Date.parse(leased!.leaseExpireAt!)).toBeGreaterThan(Date.now());
  });

  it("complete moves locked → done", async () => {
    const q = createJobQueue(createPaths(dataRoot), "rt-1");
    await q.enqueueExecuteTask({
      taskId: ids.tk,
      threadId: ids.th,
      planRevisionId: "rv-1",
      fencingToken: 1000001,
    });
    const leased = await q.leaseNext({ lockHolder: "exec-1", leaseMs: 60_000 });
    await q.complete(leased!.id, { outcome: "completed" });
    const done = await readdir(createPaths(dataRoot).jobsDir("rt-1", "done"));
    expect(done).toContain(`${leased!.id}.json`);
  });
});
