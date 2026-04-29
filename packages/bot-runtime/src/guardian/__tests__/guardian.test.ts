// packages/bot-runtime/src/guardian/__tests__/guardian.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createGuardian } from "../guardian.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "gd-"));
});

describe("Guardian", () => {
  it("/bind <thread-id> binds the calling chat to the thread", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const threadId = newId("th");
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "bind", threadId },
    });
    expect(out.kind).toBe("bound");
    if (out.kind === "bound") {
      expect(out.threadId).toBe(threadId);
    }
    const claimed = await repo.whoClaimsChat("feishu", "oc_x");
    expect(claimed).toBe(threadId);
  });

  it("/bind without thread-id returns ask-for-id reply", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "bind", threadId: null },
    });
    expect(out.kind).toBe("ask_thread_id");
  });

  it("/unbind releases chat-claim", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const threadId = newId("th");
    const binding = await repo.create({
      threadId,
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "guardian",
    });
    await repo.updateStatus(threadId, "feishu", binding.id, "bound");
    await repo.claimChat("feishu", "oc_x", threadId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "unbind" },
    });
    expect(out.kind).toBe("unbound");
    expect(await repo.whoClaimsChat("feishu", "oc_x")).toBeNull();
  });

  it("/help returns help text", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "help" },
    });
    expect(out.kind).toBe("help");
  });

  it("rejects /bind when chat is already claimed by another thread", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const existingThreadId = newId("th");
    const newThreadId = newId("th");
    await repo.claimChat("feishu", "oc_x", existingThreadId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "bind", threadId: newThreadId },
    });
    expect(out.kind).toBe("error");
    if (out.kind === "error") expect(out.reason).toMatch(/already claimed/);
  });
});
