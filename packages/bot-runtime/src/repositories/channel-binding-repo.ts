import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ChannelBinding, ChannelBindingSchema } from "../schema/channel.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type CreateBindingInput = {
  threadId: string;
  provider: string;
  externalConversationId?: string;
  externalConversationType: "dm" | "group" | "topic";
  createdBy: ChannelBinding["createdBy"];
};

export type ChannelBindingRepo = {
  create(input: CreateBindingInput): Promise<ChannelBinding>;
  load(threadId: string, provider: string, bindingId: string): Promise<ChannelBinding | null>;
  listForThread(threadId: string): Promise<ChannelBinding[]>;
  updateStatus(
    threadId: string,
    provider: string,
    bindingId: string,
    next: ChannelBinding["status"],
  ): Promise<ChannelBinding>;
  claimChat(provider: string, externalChatId: string, threadId: string): Promise<void>;
  releaseChat(provider: string, externalChatId: string): Promise<void>;
  whoClaimsChat(provider: string, externalChatId: string): Promise<string | null>;
};

export function createChannelBindingRepo(paths: Paths, runtimeId: string): ChannelBindingRepo {
  return {
    async create(input) {
      const id = newId("bd");
      const now = new Date().toISOString();
      const binding = ChannelBindingSchema.parse({
        id,
        threadId: input.threadId,
        provider: input.provider,
        externalConversationId: input.externalConversationId,
        externalConversationType: input.externalConversationType,
        status: "binding",
        createdBy: input.createdBy,
        enabled: true,
        notifyDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      await writeJson(paths.binding(runtimeId, input.threadId, input.provider, id), binding);
      return binding;
    },

    async load(threadId, provider, bindingId) {
      const raw = await readJson(paths.binding(runtimeId, threadId, provider, bindingId));
      return raw ? ChannelBindingSchema.parse(raw) : null;
    },

    async listForThread(threadId) {
      const root = path.posix.join(paths.state(runtimeId), "bindings", threadId);
      let providers: string[] = [];
      try {
        providers = await readdir(root);
      } catch {
        return [];
      }
      const out: ChannelBinding[] = [];
      for (const provider of providers) {
        let bindings: string[] = [];
        try {
          bindings = await readdir(path.posix.join(root, provider));
        } catch {
          continue;
        }
        for (const b of bindings) {
          const got = await this.load(threadId, provider, b);
          if (got) out.push(got);
        }
      }
      return out;
    },

    async updateStatus(threadId, provider, bindingId, next) {
      const cur = await this.load(threadId, provider, bindingId);
      if (!cur) throw new Error(`binding ${bindingId} not found`);
      const updated = ChannelBindingSchema.parse({
        ...cur,
        status: next,
        id: cur.id,
        createdAt: cur.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(paths.binding(runtimeId, threadId, provider, bindingId), updated);
      return updated;
    },

    async claimChat(provider, externalChatId, threadId) {
      const file = paths.chatClaim(runtimeId, provider, externalChatId);
      await mkdir(path.dirname(file), { recursive: true });
      let existing: string | null = null;
      try {
        existing = await readFile(file, "utf8");
      } catch {
        existing = null;
      }
      if (existing && existing !== threadId) {
        throw new Error(`chat ${externalChatId} already claimed by thread ${existing}`);
      }
      await writeFile(file, threadId, "utf8");
    },

    async releaseChat(provider, externalChatId) {
      const file = paths.chatClaim(runtimeId, provider, externalChatId);
      try {
        await unlink(file);
      } catch {
        /* already gone */
      }
    },

    async whoClaimsChat(provider, externalChatId) {
      const file = paths.chatClaim(runtimeId, provider, externalChatId);
      try {
        return (await readFile(file, "utf8")).trim() || null;
      } catch {
        return null;
      }
    },
  };
}
