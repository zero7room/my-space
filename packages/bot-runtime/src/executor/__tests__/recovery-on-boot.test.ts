import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../storage/json-file.js";
import { createPaths } from "../../storage/paths.js";
import { recoverOnBoot } from "../recovery-on-boot.js";

describe("recoverOnBoot", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rb-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("invokes the four recovery sweeps and returns counts", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.jobsDir("rt-1", "locked"), { recursive: true });
    await writeJson(paths.jobFile("rt-1", "locked", "j-old"), {
      id: "j-old",
      lockHolder: "ghost",
      leaseExpireAt: new Date(Date.now() - 1000).toISOString(),
    });
    const summary = await recoverOnBoot(paths, "rt-1", { dedupeRetentionDays: 30 });
    expect(summary.staleLockedJobs).toContain("j-old");
    const failedDir = await readdir(paths.jobsDir("rt-1", "failed"));
    expect(failedDir).toContain("j-old.json");
  });
});
