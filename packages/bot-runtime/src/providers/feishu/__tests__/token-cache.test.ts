import { afterEach, describe, expect, it, vi } from "vitest";
import { createTenantTokenCache } from "../token-cache.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("TenantTokenCache", () => {
  it("fetches once and caches until near expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    const fetcher = vi.fn().mockResolvedValue({ token: "t1", expiresInSec: 7200 });
    const cache = createTenantTokenCache({ fetch: fetcher });
    expect(await cache.get()).toBe("t1");
    expect(await cache.get()).toBe("t1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes after expiry minus skew", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ token: "t1", expiresInSec: 60 })
      .mockResolvedValueOnce({ token: "t2", expiresInSec: 60 });
    const cache = createTenantTokenCache({ fetch: fetcher, skewSec: 10 });
    expect(await cache.get()).toBe("t1");
    vi.setSystemTime(new Date("2026-04-29T00:00:55Z"));
    expect(await cache.get()).toBe("t2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidate forces next call to refetch", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ token: "t1", expiresInSec: 7200 })
      .mockResolvedValueOnce({ token: "t2", expiresInSec: 7200 });
    const cache = createTenantTokenCache({ fetch: fetcher });
    expect(await cache.get()).toBe("t1");
    cache.invalidate();
    expect(await cache.get()).toBe("t2");
  });
});
