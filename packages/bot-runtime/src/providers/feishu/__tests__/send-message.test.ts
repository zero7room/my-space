import { afterEach, describe, expect, it, vi } from "vitest";
import { feishuSendMessage } from "../send-message.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feishuSendMessage", () => {
  it("POSTs to /open-apis/im/v1/messages with bearer + json body and returns message_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: "ok", data: { message_id: "om_42" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await feishuSendMessage(
      { tenantAccessToken: "t1" },
      { externalConversationId: "oc_x", text: "hi", importance: "info" },
    );
    expect(r.externalMessageId).toBe("om_42");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/open-apis/im/v1/messages");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t1");
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.receive_id).toBe("oc_x");
    expect(parsed.msg_type).toBe("text");
  });

  it("throws when feishu returns non-zero code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 99991663, msg: "rate limited" }),
      }),
    );
    await expect(
      feishuSendMessage(
        { tenantAccessToken: "t1" },
        { externalConversationId: "oc_x", text: "hi", importance: "info" },
      ),
    ).rejects.toThrow(/99991663/);
  });

  it("throws on HTTP-level failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }),
    );
    await expect(
      feishuSendMessage(
        { tenantAccessToken: "t1" },
        { externalConversationId: "oc_x", text: "hi", importance: "info" },
      ),
    ).rejects.toThrow(/500/);
  });

  it("appends importance prefix for milestone/alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { message_id: "om_43" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await feishuSendMessage(
      { tenantAccessToken: "t1" },
      { externalConversationId: "oc_x", text: "done", importance: "alert" },
    );
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    const content = JSON.parse(body.content) as { text: string };
    expect(content.text).toMatch(/\[alert\]/i);
  });
});
