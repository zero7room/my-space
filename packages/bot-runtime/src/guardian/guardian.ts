// packages/bot-runtime/src/guardian/guardian.ts
import type { ChannelBindingRepo } from "../repositories/channel-binding-repo.js";
import type { Provider } from "../schema/channel.js";
import type { Paths } from "../storage/paths.js";
import type { GuardianCommand } from "./command-parser.js";

export type GuardianHandleInput = {
  provider: Provider;
  externalConversationId: string;
  externalConversationType: "dm" | "group" | "topic";
  userId: string;
  command: GuardianCommand;
};

export type GuardianResult =
  | { kind: "bound"; threadId: string }
  | { kind: "unbound" }
  | { kind: "list"; bindings: Array<{ threadId: string; provider: string }> }
  | { kind: "ask_thread_id" }
  | { kind: "help" }
  | { kind: "noop" }
  | { kind: "error"; reason: string };

export type Guardian = {
  handle(input: GuardianHandleInput): Promise<GuardianResult>;
};

export type CreateGuardianInput = {
  paths: Paths;
  runtimeId: string;
  bindingRepo: ChannelBindingRepo;
};

export function createGuardian(input: CreateGuardianInput): Guardian {
  return {
    async handle(req) {
      const { command, provider, externalConversationId, externalConversationType } = req;
      if (command.kind === "help") return { kind: "help" };
      if (command.kind === "list") {
        return { kind: "list", bindings: [] };
      }
      if (command.kind === "bind") {
        if (!command.threadId) return { kind: "ask_thread_id" };
        const existing = await input.bindingRepo.whoClaimsChat(provider, externalConversationId);
        if (existing && existing !== command.threadId) {
          return { kind: "error", reason: `chat already claimed by thread ${existing}` };
        }
        const binding = await input.bindingRepo.create({
          threadId: command.threadId,
          provider,
          externalConversationId,
          externalConversationType,
          createdBy: "guardian",
        });
        await input.bindingRepo.updateStatus(command.threadId, provider, binding.id, "bound");
        await input.bindingRepo.claimChat(provider, externalConversationId, command.threadId);
        return { kind: "bound", threadId: command.threadId };
      }
      if (command.kind === "unbind") {
        await input.bindingRepo.releaseChat(provider, externalConversationId);
        return { kind: "unbound" };
      }
      return { kind: "noop" };
    },
  };
}
