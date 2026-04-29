import { describe, expect, it } from "vitest";
import type { ChannelBinding } from "../../schema/channel.js";
import { resolveNotifyTargets } from "../_notify-target.js";

const baseBinding = (over: Partial<ChannelBinding>): ChannelBinding => ({
  id: "bd_a",
  threadId: "th_x",
  provider: "feishu",
  externalConversationId: "oc_a",
  externalConversationType: "group",
  status: "bound",
  createdBy: "client",
  enabled: true,
  notifyDefault: true,
  createdAt: "2026-04-29T01:00:00Z",
  updatedAt: "2026-04-29T01:00:00Z",
  ...over,
});

describe("resolveNotifyTargets", () => {
  it("'all' picks bindings where enabled && notifyDefault && status=bound", () => {
    const bindings = [
      baseBinding({ id: "b1" }),
      baseBinding({ id: "b2", notifyDefault: false }),
      baseBinding({ id: "b3", enabled: false }),
      baseBinding({ id: "b4", status: "binding" }),
    ];
    expect(resolveNotifyTargets("all", bindings).map((b) => b.id)).toEqual(["b1"]);
  });

  it("provider filter selects only that provider's bound bindings", () => {
    const bindings = [
      baseBinding({ id: "b1", provider: "feishu" }),
      baseBinding({ id: "b2", provider: "slack" }),
    ];
    expect(resolveNotifyTargets({ provider: "feishu" }, bindings).map((b) => b.id)).toEqual(["b1"]);
  });

  it("bindingId filter selects exactly that binding", () => {
    const bindings = [baseBinding({ id: "b1" }), baseBinding({ id: "b2" })];
    expect(resolveNotifyTargets({ bindingId: "b2" }, bindings).map((b) => b.id)).toEqual(["b2"]);
  });

  it("returns empty when no binding matches the bindingId", () => {
    expect(resolveNotifyTargets({ bindingId: "missing" }, [])).toEqual([]);
  });
});
