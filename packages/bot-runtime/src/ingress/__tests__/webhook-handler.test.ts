// packages/bot-runtime/src/ingress/__tests__/webhook-handler.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInboundEventRepo } from "../../channel/inbound-event-repo.js";
import { createProviderRegistry } from "../../channel/provider-registry.js";
import type { ChannelProvider } from "../../channel/provider.js";
import { createPaths } from "../../storage/paths.js";
import { createWebhookHandler } from "../webhook-handler.js";

let tmp: string;
const runtimeId = "rt_test";
const SECRET = "shh";

function fake(provider: string, normalize: ChannelProvider["normalizeInbound"]): ChannelProvider {
  return {
    provider,
    async verifyInbound() {
      return { ok: true, decoded: { event_id: "ext-1" } };
    },
    normalizeInbound: normalize,
    async sendMessage() {
      return { externalMessageId: "x" };
    },
    async createConversation() {
      return { externalConversationId: "x" };
    },
    async deleteConversation() {
      return;
    },
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "wh-"));
});

describe("WebhookHandler", () => {
  it("returns 200 + dispatches to MasterHost.ingestInbound on first delivery", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    const reg = createProviderRegistry();
    reg.register(
      fake("feishu", async () => ({
        externalEventId: "ext-1",
        externalMessageId: "msg-1",
        externalConversationId: "oc_1",
        externalConversationType: "group",
        externalUserId: "ou_alice",
        text: "@bot do x",
        mentionsBot: true,
        replyToBotMessage: false,
        slashCommand: null,
        receivedAt: "2026-04-29T01:00:00Z",
        raw: {},
      })),
    );
    const ingest = vi.fn().mockResolvedValue({ kind: "noop" });
    const lookup = vi.fn().mockResolvedValue({
      threadId: "th_1",
      bound: true,
      userId: "u_alice",
    });
    const handler = createWebhookHandler({
      registry: reg,
      inboundRepo: repo,
      ingest,
      lookupBinding: lookup,
      configResolver: async () => ({ secret: SECRET }),
    });
    const res = await handler({
      provider: "feishu",
      headers: {},
      rawBody: Buffer.from("{}"),
    });
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledTimes(1);
    const stored = await repo.load("feishu", "ext-1");
    expect(stored?.status).toBe("processed");
  });

  it("returns 200 and skips dispatch when externalEventId is duplicate", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "ext-1", {});
    await repo.markProcessed("feishu", "ext-1");
    const reg = createProviderRegistry();
    reg.register(
      fake("feishu", async () => ({
        externalEventId: "ext-1",
        externalConversationId: "oc_1",
        externalConversationType: "group",
        externalUserId: "ou_alice",
        text: "x",
        mentionsBot: false,
        replyToBotMessage: false,
        slashCommand: null,
        receivedAt: "2026-04-29T01:00:00Z",
        raw: {},
      })),
    );
    const ingest = vi.fn();
    const handler = createWebhookHandler({
      registry: reg,
      inboundRepo: repo,
      ingest,
      lookupBinding: async () => ({ threadId: "th_1", bound: true, userId: "u_a" }),
      configResolver: async () => ({ secret: SECRET }),
    });
    const res = await handler({
      provider: "feishu",
      headers: {},
      rawBody: Buffer.from("{}"),
    });
    expect(res.status).toBe(200);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns 401 when verifyInbound fails", async () => {
    const paths = createPaths(tmp);
    const reg = createProviderRegistry();
    reg.register({
      provider: "feishu",
      async verifyInbound() {
        return { ok: false, reason: "bad-signature" };
      },
      async normalizeInbound() {
        return null;
      },
      async sendMessage() {
        return { externalMessageId: "x" };
      },
      async createConversation() {
        return { externalConversationId: "x" };
      },
      async deleteConversation() {
        return;
      },
    });
    const handler = createWebhookHandler({
      registry: reg,
      inboundRepo: createInboundEventRepo(paths, runtimeId),
      ingest: async (): Promise<import("../../thread-loop/thread-loop.js").ThreadLoopResult> => ({
        kind: "noop",
        intent: "chat",
      }),
      lookupBinding: async () => ({ threadId: "th_1", bound: true, userId: "u_a" }),
      configResolver: async () => ({ secret: SECRET }),
    });
    const res = await handler({ provider: "feishu", headers: {}, rawBody: Buffer.from("") });
    expect(res.status).toBe(401);
  });
});
