import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createGuardianThreadBootstrap } from "../thread-bootstrap.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "gtb-"));
});

describe("GuardianThreadBootstrap", () => {
  it("creates a guardian thread the first time a user shows up", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const boot = createGuardianThreadBootstrap({ paths, runtimeId, threadRepo: repo });
    const userId = newId("u");
    const id = await boot.ensureGuardianThread(userId);
    expect(id).toMatch(/^th_/);
    const t = await repo.load(id);
    expect(t?.ownerUserId).toBe(userId);
  });

  it("returns the same id for repeat calls", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const boot = createGuardianThreadBootstrap({ paths, runtimeId, threadRepo: repo });
    const userId = newId("u");
    const a = await boot.ensureGuardianThread(userId);
    const b = await boot.ensureGuardianThread(userId);
    expect(a).toBe(b);
  });
});
