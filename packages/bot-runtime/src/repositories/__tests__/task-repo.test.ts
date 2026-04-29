import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createTaskRepo } from "../task-repo.js";

describe("TaskRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "tkr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    th: "th_018f5d20-0000-7000-8000-000000000001",
    user: "u_018f5d20-0000-7000-8000-000000000001",
  } as const;

  it("createDraft has draft status and ownerUserId", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    expect(t.status).toBe("draft");
    expect(t.ownerUserId).toBe(ids.user);
  });

  it("transitionStatus enforces legal transitions", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    await repo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await repo.transitionStatus(t.id, "queued");
    await repo.transitionStatus(t.id, "running");
    await expect(
      repo.transitionStatus(t.id, "draft" as never),
    ).rejects.toThrow(/illegal transition/);
  });

  it("listByThread filters by threadId and status", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const a = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "a",
      description: "",
      sourceMessageIds: [],
    });
    await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "b",
      description: "",
      sourceMessageIds: [],
    });
    await repo.transitionStatus(a.id, "confirmed", { confirmedByUserId: ids.user });
    const drafts = await repo.listByThread(ids.th, { status: ["draft"] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toBe("b");
  });

  it("update preserves id and createdAt", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "",
      sourceMessageIds: [],
    });
    const tampered = await repo.update(t.id, {
      id: "tk_other" as never,
      createdAt: "2000-01-01T00:00:00Z" as never,
      description: "updated",
    });
    expect(tampered.id).toBe(t.id);
    expect(tampered.createdAt).toBe(t.createdAt);
    expect(tampered.description).toBe("updated");
  });
});
