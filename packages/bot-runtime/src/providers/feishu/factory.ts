import type { ChannelProvider } from "../../channel/provider.js";
import type { FeishuConfig, FeishuSecrets } from "./config.js";
import { createFeishuProvider } from "./provider.js";
import { type TenantTokenFetchResult, createTenantTokenCache } from "./token-cache.js";

export type CreateFromConfigInput = {
  config: FeishuConfig;
  secrets: FeishuSecrets;
  botOpenId: string;
  fetchToken?: (input: { appId: string; appSecret: string }) => Promise<TenantTokenFetchResult>;
};

export function createFeishuProviderFromConfig(input: CreateFromConfigInput): ChannelProvider {
  const fetcher =
    input.fetchToken ??
    (async () => {
      throw new Error("fetchToken not provided; pass fetchFeishuTenantAccessToken in production");
    });
  const tokenCache = createTenantTokenCache({
    fetch: () => fetcher({ appId: input.config.appId, appSecret: input.secrets.appSecret }),
  });
  return createFeishuProvider({
    verificationToken: input.config.verificationToken,
    encryptKey: input.config.encryptKey,
    botOpenId: input.botOpenId,
    tokenCache,
  });
}
