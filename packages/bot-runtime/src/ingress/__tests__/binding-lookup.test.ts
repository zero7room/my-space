import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createBindingLookup } from "../binding-lookup.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "bl-"));
});

describe("BindingLookup", () => {
  it("returns the bound thread when chat-claim exists", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const threadId = newId("th");
    const binding = await repo.create({
      threadId,
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "client",
    });
    await repo.updateStatus(threadId, "feishu", binding.id, "bound");
    await repo.claimChat("feishu", "oc_x", threadId);

    const lookup = createBindingLookup(paths, runtimeId, {
      resolveUserByExternalId: async () => "u_alice",
      createGuardianThread: async () => newId("th"),
    });
    const got = await lookup("feishu", "oc_x", "group", "ou_alice");
    expect(got).toEqual({ threadId, bound: true, userId: "u_alice" });
  });

  it("returns guardian thread for unbound group with no chat-claim", async () => {
    const paths = createPaths(tmp);
    const guardianThreadId = newId("th");
    const lookup = createBindingLookup(paths, runtimeId, {
      resolveUserByExternalId: async () => "u_alice",
      createGuardianThread: async () => guardianThreadId,
    });
    const got = await lookup("feishu", "oc_unknown", "group", "ou_alice");
    expect(got).toEqual({ threadId: guardianThreadId, bound: false, userId: "u_alice" });
  });

  it("DM always routes to guardian thread", async () => {
    const paths = createPaths(tmp);
    const guardianThreadId = newId("th");
    const lookup = createBindingLookup(paths, runtimeId, {
      resolveUserByExternalId: async () => "u_alice",
      createGuardianThread: async () => guardianThreadId,
    });
    const got = await lookup("feishu", "p2p_x", "dm", "ou_alice");
    expect(got?.threadId).toBe(guardianThreadId);
    expect(got?.bound).toBe(false);
  });
});
