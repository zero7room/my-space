import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ChannelJob, ChannelJobSchema } from "../schema/channel.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type EnqueueSendMessageInput = {
  provider: string;
  payload: {
    externalConversationId: string;
    text: string;
    importance: "info" | "milestone" | "alert";
    replyToExternalMessageId?: string;
  };
  dedupeKey?: string;
};

export type ChannelOutboundJobQueue = {
  enqueueSendMessage(input: EnqueueSendMessageInput): Promise<ChannelJob>;
  listPending(): Promise<ChannelJob[]>;
  load(jobId: string): Promise<ChannelJob | null>;
  markRunning(jobId: string): Promise<ChannelJob>;
  markSucceeded(jobId: string, result: Record<string, unknown>): Promise<ChannelJob>;
  markFailed(jobId: string, lastError: string, dead: boolean): Promise<ChannelJob>;
};

const CHANNEL_JOB_TYPES = new Set(["send_message", "create_conversation", "delete_conversation"]);

export function createChannelOutboundJobQueue(
  paths: Paths,
  runtimeId: string,
): ChannelOutboundJobQueue {
  const jobsRoot = path.posix.join(paths.state(runtimeId), "jobs");
  const pendingDir = path.posix.join(jobsRoot, "pending");
  const dedupeDir = path.posix.join(jobsRoot, "dedupe");

  function jobFile(dir: string, id: string) {
    return path.posix.join(dir, `${id}.json`);
  }

  async function locate(jobId: string): Promise<string | null> {
    for (const sub of ["pending", "locked", "done", "failed"]) {
      const f = path.posix.join(jobsRoot, sub, `${jobId}.json`);
      const got = await readJson(f);
      if (got) return f;
    }
    return null;
  }

  return {
    async enqueueSendMessage(input) {
      await mkdir(pendingDir, { recursive: true });
      await mkdir(dedupeDir, { recursive: true });
      if (input.dedupeKey) {
        try {
          const dedupeFile = path.posix.join(dedupeDir, input.dedupeKey);
          const existingId = (await readFile(dedupeFile, "utf8")).trim();
          if (existingId) {
            const where = await locate(existingId);
            if (where) {
              const existing = await readJson(where);
              if (existing) return ChannelJobSchema.parse(existing);
            }
          }
        } catch {
          /* not a duplicate */
        }
      }
      const now = new Date().toISOString();
      const jobData: Record<string, unknown> = {
        id: newId("cj"),
        provider: input.provider,
        type: "send_message",
        status: "pending",
        payload: input.payload as unknown as Record<string, unknown>,
        attemptCount: 0,
        runAfter: now,
        createdAt: now,
        updatedAt: now,
      };
      if (input.dedupeKey !== undefined) {
        jobData.dedupeKey = input.dedupeKey;
      }
      const job = ChannelJobSchema.parse(jobData);
      await writeJson(jobFile(pendingDir, job.id), job);
      if (input.dedupeKey) {
        await writeFile(path.posix.join(dedupeDir, input.dedupeKey), job.id, "utf8");
      }
      return job;
    },

    async listPending() {
      await mkdir(pendingDir, { recursive: true });
      const files = await readdir(pendingDir);
      const out: ChannelJob[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const got = await readJson(path.posix.join(pendingDir, f));
        if (!got) continue;
        const parsed = ChannelJobSchema.safeParse(got);
        if (parsed.success && CHANNEL_JOB_TYPES.has(parsed.data.type)) {
          out.push(parsed.data);
        }
      }
      return out;
    },

    async load(jobId) {
      const where = await locate(jobId);
      if (!where) return null;
      const got = await readJson(where);
      return got ? ChannelJobSchema.parse(got) : null;
    },

    async markRunning(jobId) {
      const cur = await this.load(jobId);
      if (!cur) throw new Error(`channel job ${jobId} not found`);
      const updated = ChannelJobSchema.parse({
        ...cur,
        id: cur.id,
        createdAt: cur.createdAt,
        status: "running",
        attemptCount: cur.attemptCount + 1,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(jobFile(path.posix.join(jobsRoot, "locked"), jobId), updated);
      return updated;
    },

    async markSucceeded(jobId, result) {
      const cur = await this.load(jobId);
      if (!cur) throw new Error(`channel job ${jobId} not found`);
      const updated = ChannelJobSchema.parse({
        ...cur,
        id: cur.id,
        createdAt: cur.createdAt,
        status: "succeeded",
        result,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(jobFile(path.posix.join(jobsRoot, "done"), jobId), updated);
      return updated;
    },

    async markFailed(jobId, lastError, dead) {
      const cur = await this.load(jobId);
      if (!cur) throw new Error(`channel job ${jobId} not found`);
      const updated = ChannelJobSchema.parse({
        ...cur,
        id: cur.id,
        createdAt: cur.createdAt,
        status: dead ? "dead" : "failed",
        lastError,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(jobFile(path.posix.join(jobsRoot, "failed"), jobId), updated);
      return updated;
    },
  };
}
