import { describe, expect, it } from "vitest";
import {
  ChannelBindingSchema,
  ChannelConfigSchema,
  ChannelInboundEventSchema,
  ChannelJobSchema,
} from "../channel.js";

describe("ChannelSchemas", () => {
  it("ChannelConfig holds publicFields and secretRefs separately", () => {
    const c = ChannelConfigSchema.parse({
      provider: "feishu",
      enabled: true,
      ingress: { webhookEnabled: true },
      publicFields: { botName: "ai-employee" },
      secretRefs: { botAppSecret: "ref://secret/lark/app_secret" },
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(c.provider).toBe("feishu");
  });

  it("ChannelBinding statuses", () => {
    const b = ChannelBindingSchema.parse({
      id: "bd_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      provider: "feishu",
      externalConversationType: "group",
      status: "bound",
      createdBy: "client",
      enabled: true,
      notifyDefault: true,
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(b.notifyDefault).toBe(true);
  });

  it("ChannelJob types are limited", () => {
    expect(ChannelJobSchema.shape.type.options).toEqual([
      "create_conversation",
      "delete_conversation",
      "send_message",
    ]);
  });

  it("ChannelInboundEvent allows external ids", () => {
    const e = ChannelInboundEventSchema.parse({
      id: "ev_018f5d20-0000-7000-8000-000000000001",
      provider: "feishu",
      externalEventId: "lark-evt-1",
      externalMessageId: "om_xx",
      status: "received",
      payloadRef: "webhooks/feishu/lark-evt-1.json",
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(e.externalMessageId).toBe("om_xx");
  });
});
