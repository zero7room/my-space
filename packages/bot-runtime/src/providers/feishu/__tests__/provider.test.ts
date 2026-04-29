import { afterEach, describe, expect, it, vi } from "vitest";
import { createFeishuProvider } from "../provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFeishuProvider", () => {
  it("name is feishu", () => {
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get: async () => "tk", invalidate: () => {} },
    });
    expect(p.provider).toBe("feishu");
  });

  it("verifyInbound delegates to verifyFeishuSignature", async () => {
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get: async () => "tk", invalidate: () => {} },
    });
    const body = JSON.stringify({ token: "v_t", type: "url_verification", challenge: "c" });
    const r = await p.verifyInbound({ headers: {}, rawBody: Buffer.from(body), secret: "" });
    expect(r.ok).toBe(true);
  });

  it("normalizeInbound returns null for non-message events", async () => {
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get: async () => "tk", invalidate: () => {} },
    });
    expect(
      await p.normalizeInbound({ header: { event_type: "im.message.message_read_v1" } }),
    ).toBeNull();
  });

  it("sendMessage uses tokenCache.get and forwards to feishuSendMessage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { message_id: "om_42" } }),
      }),
    );
    const get = vi.fn().mockResolvedValue("tk_live");
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get, invalidate: () => {} },
    });
    const r = await p.sendMessage({
      externalConversationId: "oc_x",
      text: "hi",
      importance: "info",
    });
    expect(r.externalMessageId).toBe("om_42");
    expect(get).toHaveBeenCalled();
  });
});
