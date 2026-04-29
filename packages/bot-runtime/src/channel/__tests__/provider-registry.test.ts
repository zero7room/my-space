// packages/bot-runtime/src/channel/__tests__/provider-registry.test.ts
import { describe, expect, it } from "vitest";
import { createProviderRegistry } from "../provider-registry.js";
import type { ChannelProvider } from "../provider.js";

function makeFake(name: string): ChannelProvider {
  return {
    provider: name,
    async verifyInbound() {
      return { ok: true };
    },
    async normalizeInbound() {
      return null;
    },
    async sendMessage() {
      return { externalMessageId: "x" };
    },
    async createConversation() {
      return { externalConversationId: "c" };
    },
    async deleteConversation() {
      return;
    },
  };
}

describe("createProviderRegistry", () => {
  it("registers and resolves a provider by name", () => {
    const r = createProviderRegistry();
    const fake = makeFake("feishu");
    r.register(fake);
    expect(r.get("feishu")).toBe(fake);
  });

  it("throws when registering a duplicate provider", () => {
    const r = createProviderRegistry();
    r.register(makeFake("feishu"));
    expect(() => r.register(makeFake("feishu"))).toThrow(/already registered/);
  });

  it("returns null for unknown provider", () => {
    const r = createProviderRegistry();
    expect(r.get("slack")).toBeNull();
  });

  it("lists registered providers", () => {
    const r = createProviderRegistry();
    r.register(makeFake("feishu"));
    r.register(makeFake("slack"));
    expect(r.list().sort()).toEqual(["feishu", "slack"]);
  });

  it("removes a registered provider", () => {
    const r = createProviderRegistry();
    r.register(makeFake("feishu"));
    expect(r.get("feishu")).toBeTruthy();
    r.remove("feishu");
    expect(r.get("feishu")).toBeNull();
    expect(r.list()).toEqual([]);
  });
});
