import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createThreadRepo } from "../thread-repo.js";

describe("ThreadRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "thrr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("create then load roundtrip", async () => {
    const repo = createThreadRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.create({
      title: "demo",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
    });
    expect(t.status).toBe("chatting");
    const loaded = await repo.load(t.id);
    expect(loaded?.id).toBe(t.id);
  });

  it("update sets updatedAt and rejects unknown status", async () => {
    const repo = createThreadRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.create({
      title: "demo",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
    });
    const updated = await repo.update(t.id, { status: "working" });
    expect(updated.status).toBe("working");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(t.updatedAt),
    );
    await expect(
      repo.update(t.id, { status: "weird" as never }),
    ).rejects.toThrow();
  });

  it("listAll enumerates all threads", async () => {
    const repo = createThreadRepo(createPaths(dataRoot), "rt-1");
    await repo.create({ title: "a", ownerUserId: "u_018f5d20-0000-7000-8000-000000000001" });
    await repo.create({ title: "b", ownerUserId: "u_018f5d20-0000-7000-8000-000000000001" });
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });
});
