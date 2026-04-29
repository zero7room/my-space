import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeishuTenantAccessToken } from "../fetch-token.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFeishuTenantAccessToken", () => {
  it("POSTs app_id + app_secret and returns token + expire", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, tenant_access_token: "t1", expire: 7200 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchFeishuTenantAccessToken({ appId: "cli_x", appSecret: "s" });
    expect(r.token).toBe("t1");
    expect(r.expiresInSec).toBe(7200);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.app_id).toBe("cli_x");
    expect(body.app_secret).toBe("s");
  });

  it("throws on non-zero code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 10003, msg: "bad" }) }),
    );
    await expect(fetchFeishuTenantAccessToken({ appId: "cli_x", appSecret: "s" })).rejects.toThrow(
      /10003/,
    );
  });
});
