import { mkdir, readdir } from "node:fs/promises";
import { readJson, writeJson } from "../storage/json-file.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import { type Thread, ThreadSchema } from "../schema/thread.js";

export type CreateThreadInput = {
  title: string;
  ownerUserId: string;
};

export type ThreadRepo = {
  create(input: CreateThreadInput): Promise<Thread>;
  load(threadId: string): Promise<Thread | null>;
  update(threadId: string, patch: Partial<Thread>): Promise<Thread>;
  listAll(): Promise<Thread[]>;
};

export function createThreadRepo(paths: Paths, runtimeId: string): ThreadRepo {
  return {
    async create(input) {
      const now = new Date().toISOString();
      const id = newId("th");
      const t: Thread = ThreadSchema.parse({
        id,
        ownerUserId: input.ownerUserId,
        title: input.title,
        status: "chatting",
        taskListId: `tl_${id}`,
        channelBindingIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(paths.threadDir(runtimeId, id), { recursive: true });
      await writeJson(paths.threadJson(runtimeId, id), t);
      return t;
    },

    async load(threadId) {
      const raw = await readJson(paths.threadJson(runtimeId, threadId));
      if (!raw) return null;
      return ThreadSchema.parse(raw);
    },

    async update(threadId, patch) {
      const cur = await this.load(threadId);
      if (!cur) throw new Error(`thread ${threadId} not found`);
      const next = ThreadSchema.parse({
        ...cur,
        ...patch,
        id: cur.id,
        createdAt: cur.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(paths.threadJson(runtimeId, threadId), next);
      return next;
    },

    async listAll() {
      const root = paths.threadsRoot(runtimeId);
      await mkdir(root, { recursive: true });
      const dirs = await readdir(root);
      const out: Thread[] = [];
      for (const d of dirs) {
        const t = await this.load(d);
        if (t) out.push(t);
      }
      return out;
    },
  };
}
