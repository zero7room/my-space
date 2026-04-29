import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelOutboundJobQueue } from "../outbound-job-queue.js";
import { createChannelOutboundRunner } from "../outbound-runner.js";
import { createProviderRegistry } from "../provider-registry.js";
import type { ChannelProvider } from "../provider.js";

let tmp: string;
const runtimeId = "rt_test";

function fakeFeishu(
  send: (args: unknown) => Promise<{ externalMessageId: string }>,
): ChannelProvider {
  return {
    provider: "feishu",
    async verifyInbound() {
      return { ok: true };
    },
    async normalizeInbound() {
      return null;
    },
    sendMessage: send as ChannelProvider["sendMessage"],
    async createConversation() {
      return { externalConversationId: "x" };
    },
    async deleteConversation() {
      return;
    },
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "cor-"));
});

describe("ChannelOutboundRunner", () => {
  it("processes a pending send_message job and marks it succeeded", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const send = vi.fn().mockResolvedValue({ externalMessageId: "om_42" });
    reg.register(fakeFeishu(send));
    const runner = createChannelOutboundRunner({ queue: q, registry: reg });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("succeeded");
    expect(after?.result).toEqual({ externalMessageId: "om_42" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("marks failed when provider throws and not yet at max attempts", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    reg.register(fakeFeishu(send));
    const runner = createChannelOutboundRunner({ queue: q, registry: reg, maxAttempts: 3 });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("failed");
    expect(after?.attemptCount).toBe(1);
  });

  it("marks dead after attempts exceed max", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    reg.register(fakeFeishu(send));
    const runner = createChannelOutboundRunner({ queue: q, registry: reg, maxAttempts: 1 });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("dead");
  });

  it("skips jobs whose provider is not registered", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const runner = createChannelOutboundRunner({ queue: q, registry: reg });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("failed");
    expect(after?.lastError).toContain("provider feishu not registered");
  });
});
