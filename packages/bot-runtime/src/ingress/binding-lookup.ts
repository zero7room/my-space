import { createChannelBindingRepo } from "../repositories/channel-binding-repo.js";
import type { Paths } from "../storage/paths.js";
import type { BindingLookup } from "./webhook-handler.js";

export type BindingLookupDeps = {
  resolveUserByExternalId: (provider: string, externalUserId: string) => Promise<string>;
  createGuardianThread: (
    provider: string,
    userId: string,
    externalConversationType: "dm" | "group" | "topic",
    externalConversationId: string,
  ) => Promise<string>;
};

export function createBindingLookup(
  paths: Paths,
  runtimeId: string,
  deps: BindingLookupDeps,
): BindingLookup {
  const repo = createChannelBindingRepo(paths, runtimeId);
  return async (provider, externalConversationId, externalConversationType, externalUserId) => {
    const userId = await deps.resolveUserByExternalId(provider, externalUserId);
    if (externalConversationType === "group") {
      const claimed = await repo.whoClaimsChat(provider, externalConversationId);
      if (claimed) {
        return { threadId: claimed, bound: true, userId };
      }
    }
    const guardianThreadId = await deps.createGuardianThread(
      provider,
      userId,
      externalConversationType,
      externalConversationId,
    );
    return { threadId: guardianThreadId, bound: false, userId };
  };
}
