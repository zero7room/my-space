import { mkdir, readdir } from "node:fs/promises";
import { type Task, TaskSchema, type TaskStatus } from "../schema/task.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["awaiting_critical_node", "blocked", "changing", "completed", "failed"],
  awaiting_critical_node: ["running", "cancelled"],
  blocked: ["running", "cancelled"],
  changing: ["queued", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export type CreateDraftTaskInput = {
  threadId: string;
  ownerUserId: string;
  title: string;
  description: string;
  sourceMessageIds: string[];
};

export type TaskRepo = {
  createDraft(input: CreateDraftTaskInput): Promise<Task>;
  load(taskId: string): Promise<Task | null>;
  loadInThread(threadId: string, taskId: string): Promise<Task | null>;
  update(taskId: string, patch: Partial<Task>): Promise<Task>;
  transitionStatus(taskId: string, next: TaskStatus, extras?: Partial<Task>): Promise<Task>;
  listByThread(threadId: string, opts?: { status?: TaskStatus[] }): Promise<Task[]>;
};

export function createTaskRepo(paths: Paths, runtimeId: string): TaskRepo {
  async function findFile(taskId: string): Promise<{
    threadId: string;
    file: string;
  } | null> {
    const root = paths.threadsRoot(runtimeId);
    await mkdir(root, { recursive: true });
    for (const th of await readdir(root)) {
      const f = paths.taskJson(runtimeId, th, taskId);
      const got = await readJson(f);
      if (got) return { threadId: th, file: f };
    }
    return null;
  }

  return {
    async createDraft(input) {
      const now = new Date().toISOString();
      const id = newId("tk");
      const t: Task = TaskSchema.parse({
        id,
        threadId: input.threadId,
        ownerUserId: input.ownerUserId,
        title: input.title,
        description: input.description,
        status: "draft",
        sourceMessageIds: input.sourceMessageIds,
        artifactIds: [],
        changeRecordIds: [],
        archivedRevisionIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(paths.taskDir(runtimeId, input.threadId, id), {
        recursive: true,
      });
      await writeJson(paths.taskJson(runtimeId, input.threadId, id), t);
      return t;
    },

    async load(taskId) {
      const found = await findFile(taskId);
      if (!found) return null;
      return TaskSchema.parse(await readJson(found.file));
    },

    async loadInThread(threadId, taskId) {
      const raw = await readJson(paths.taskJson(runtimeId, threadId, taskId));
      return raw ? TaskSchema.parse(raw) : null;
    },

    async update(taskId, patch) {
      const found = await findFile(taskId);
      if (!found) throw new Error(`task ${taskId} not found`);
      const cur = TaskSchema.parse(await readJson(found.file));
      const next = TaskSchema.parse({
        ...cur,
        ...patch,
        id: cur.id,
        createdAt: cur.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(found.file, next);
      return next;
    },

    async transitionStatus(taskId, next, extras = {}) {
      const cur = await this.load(taskId);
      if (!cur) throw new Error(`task ${taskId} not found`);
      const allowed = LEGAL_TRANSITIONS[cur.status] ?? [];
      if (!allowed.includes(next)) {
        throw new Error(`illegal transition: ${cur.status} -> ${next} for task ${taskId}`);
      }
      return this.update(taskId, { status: next, ...extras });
    },

    async listByThread(threadId, opts = {}) {
      const dir = paths.threadDir(runtimeId, threadId);
      const tasksDir = `${dir}/tasks`;
      let names: string[] = [];
      try {
        names = await readdir(tasksDir);
      } catch {
        return [];
      }
      const out: Task[] = [];
      for (const id of names) {
        const t = await this.loadInThread(threadId, id);
        if (!t) continue;
        if (opts.status && !opts.status.includes(t.status)) continue;
        out.push(t);
      }
      return out;
    },
  };
}
