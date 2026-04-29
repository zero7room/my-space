import type { TenantTokenFetchResult } from "./token-cache.js";

const FEISHU_HOST = "https://open.feishu.cn";

export async function fetchFeishuTenantAccessToken(input: {
  appId: string;
  appSecret: string;
}): Promise<TenantTokenFetchResult> {
  const res = await fetch(`${FEISHU_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: input.appId, app_secret: input.appSecret }),
  });
  if (!res.ok) throw new Error(`feishu tenant_access_token HTTP ${res.status}`);
  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`feishu tenant_access_token code=${json.code}`);
  }
  return { token: json.tenant_access_token, expiresInSec: json.expire ?? 7200 };
}
