export type TenantTokenFetchResult = {
  token: string;
  expiresInSec: number;
};

export type TenantTokenCache = {
  get(): Promise<string>;
  invalidate(): void;
};

export function createTenantTokenCache(opts: {
  fetch: () => Promise<TenantTokenFetchResult>;
  skewSec?: number;
}): TenantTokenCache {
  const skewSec = opts.skewSec ?? 30;
  let cached: { token: string; expiresAt: number } | null = null;

  return {
    async get() {
      const now = Date.now();
      if (cached && now < cached.expiresAt) {
        return cached.token;
      }
      const fresh = await opts.fetch();
      cached = {
        token: fresh.token,
        expiresAt: now + (fresh.expiresInSec - skewSec) * 1000,
      };
      return cached.token;
    },
    invalidate() {
      cached = null;
    },
  };
}
