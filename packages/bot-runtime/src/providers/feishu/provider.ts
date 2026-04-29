import type { ChannelProvider } from "../../channel/provider.js";
import { feishuCreateConversation } from "./create-conversation.js";
import { normalizeFeishuInbound } from "./normalize.js";
import { feishuSendMessage } from "./send-message.js";
import { verifyFeishuSignature } from "./signature.js";
import type { TenantTokenCache } from "./token-cache.js";

export type CreateFeishuProviderInput = {
  verificationToken: string;
  encryptKey: string;
  botOpenId: string;
  tokenCache: TenantTokenCache;
};

export function createFeishuProvider(input: CreateFeishuProviderInput): ChannelProvider {
  return {
    provider: "feishu",
    async verifyInbound(req) {
      return verifyFeishuSignature({
        headers: req.headers,
        rawBody: req.rawBody,
        verificationToken: input.verificationToken,
        encryptKey: input.encryptKey,
      });
    },
    async normalizeInbound(decoded) {
      return normalizeFeishuInbound(decoded, { botOpenId: input.botOpenId });
    },
    async sendMessage(args) {
      const tk = await input.tokenCache.get();
      return feishuSendMessage({ tenantAccessToken: tk }, args);
    },
    async createConversation(args) {
      const tk = await input.tokenCache.get();
      return feishuCreateConversation({ tenantAccessToken: tk }, args);
    },
    async deleteConversation() {
      return;
    },
  };
}
