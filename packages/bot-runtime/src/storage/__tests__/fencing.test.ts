import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFencingTokenIssuer } from "../fencing.js";
import { acquireInstanceLock } from "../lock.js";
import { createPaths } from "../paths.js";

describe("fencing", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "fence-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("issuer returns monotonically increasing tokens within a session", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const issuer = await createFencingTokenIssuer(paths, "rt-1");
    const a = issuer.issue();
    const b = issuer.issue();
    const c = issuer.issue();
    expect(a < b && b < c).toBe(true);
    await release();
  });

  it("new session produces tokens greater than previous session", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-2"), { recursive: true });
    const r1 = await acquireInstanceLock(paths, "rt-2", { role: "hybrid" });
    const issuer1 = await createFencingTokenIssuer(paths, "rt-2");
    const last1 = issuer1.issue();
    await r1();
    const r2 = await acquireInstanceLock(paths, "rt-2", { role: "hybrid" });
    const issuer2 = await createFencingTokenIssuer(paths, "rt-2");
    const first2 = issuer2.issue();
    expect(first2).toBeGreaterThan(last1);
    await r2();
  });
});
