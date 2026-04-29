import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelBindingRepo } from "../channel-binding-repo.js";

describe("ChannelBindingRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "cbr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const th = "th_018f5d20-0000-7000-8000-000000000001";

  it("create + list returns active binding", async () => {
    const repo = createChannelBindingRepo(createPaths(dataRoot), "rt-1");
    const b = await repo.create({
      threadId: th,
      provider: "feishu",
      externalConversationId: "oc_xxx",
      externalConversationType: "group",
      createdBy: "client",
    });
    expect(b.status).toBe("binding");
    const all = await repo.listForThread(th);
    expect(all).toHaveLength(1);
  });

  it("claimChat prevents same external chat being bound twice", async () => {
    const repo = createChannelBindingRepo(createPaths(dataRoot), "rt-1");
    await repo.claimChat("feishu", "oc_xxx", th);
    await expect(
      repo.claimChat("feishu", "oc_xxx", "th_other"),
    ).rejects.toThrow(/already claimed/);
  });

  it("releaseChat removes the claim file", async () => {
    const repo = createChannelBindingRepo(createPaths(dataRoot), "rt-1");
    await repo.claimChat("feishu", "oc_xxx", th);
    await repo.releaseChat("feishu", "oc_xxx");
    await repo.claimChat("feishu", "oc_xxx", "th_other");
  });
});
