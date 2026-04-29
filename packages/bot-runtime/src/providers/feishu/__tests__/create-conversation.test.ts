import { afterEach, describe, expect, it, vi } from "vitest";
import { feishuCreateConversation } from "../create-conversation.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feishuCreateConversation", () => {
  it("DM type: returns p2p chat by open_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { chat_id: "p2p_xxx" } }),
      }),
    );
    const r = await feishuCreateConversation(
      { tenantAccessToken: "t1" },
      { type: "dm", externalUserId: "ou_alice" },
    );
    expect(r.externalConversationId).toBe("p2p_xxx");
  });

  it("group type: returns chat_id from create_chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { chat_id: "oc_new" } }),
      }),
    );
    const r = await feishuCreateConversation(
      { tenantAccessToken: "t1" },
      { type: "group", topic: "task channel" },
    );
    expect(r.externalConversationId).toBe("oc_new");
  });

  it("throws on missing externalUserId for dm", async () => {
    await expect(
      feishuCreateConversation({ tenantAccessToken: "t1" }, { type: "dm" }),
    ).rejects.toThrow(/externalUserId/);
  });
});
