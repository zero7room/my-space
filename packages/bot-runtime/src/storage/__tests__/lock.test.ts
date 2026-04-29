import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireInstanceLock, readRuntimeInfo, releaseInstanceLock, touchRuntimeInfo } from "../lock.js";
import { createPaths } from "../paths.js";

describe("lock", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "lock-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("acquireInstanceLock writes runtime-info and returns release fn", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const info = await readRuntimeInfo(paths, "rt-1");
    expect(info?.role).toBe("hybrid");
    expect(info?.fencingTokenSeed).toBe(1);
    await release();
  });

  it("acquireInstanceLock throws if already held", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    await expect(
      acquireInstanceLock(paths, "rt-1", { role: "hybrid" })
    ).rejects.toThrow();
    await release();
  });

  it("re-acquire after release increments fencingTokenSeed", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release1 = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    await release1();
    const release2 = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const info = await readRuntimeInfo(paths, "rt-1");
    expect(info?.fencingTokenSeed).toBe(2);
    await release2();
  });

  it("touchRuntimeInfo updates lastSeenAt", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const before = (await readRuntimeInfo(paths, "rt-1"))!.lastSeenAt;
    await new Promise((r) => setTimeout(r, 5));
    await touchRuntimeInfo(paths, "rt-1");
    const after = (await readRuntimeInfo(paths, "rt-1"))!.lastSeenAt;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    await release();
  });
});
