import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient", () => {
  it("getThreads attaches admin token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => [{ id: "th_1", title: "T" }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "http://x", adminToken: "tok" });
    const list = await client.getThreads();
    expect(list).toEqual([{ id: "th_1", title: "T" }]);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-admin-token"]).toBe("tok");
  });

  it("postMessage POSTs JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ kind: "draft_created" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "http://x", adminToken: "tok" });
    await client.postMessage("th_1", { text: "hi", fromUserId: "u_a" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "hi", fromUserId: "u_a" });
  });

  it("throws on non-2xx with body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        text: async () => "nope",
      }),
    );
    const client = createApiClient({ baseUrl: "http://x", adminToken: "tok" });
    await expect(client.getThreads()).rejects.toThrow(/401/);
  });
});
