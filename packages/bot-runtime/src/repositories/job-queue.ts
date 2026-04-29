import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { type ExecuteTaskJob, ExecuteTaskJobSchema } from "../schema/job.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { JobStatus, Paths } from "../storage/paths.js";

export type EnqueueExecuteTaskInput = {
  taskId: string;
  threadId: string;
  planRevisionId: string;
  fencingToken: number;
  budget?: ExecuteTaskJob["budget"];
};

export type LeaseInput = {
  lockHolder: string;
  leaseMs: number;
};

export type JobQueue = {
  enqueueExecuteTask(input: EnqueueExecuteTaskInput): Promise<ExecuteTaskJob>;
  leaseNext(input: LeaseInput): Promise<ExecuteTaskJob | null>;
  heartbeat(jobId: string, leaseMs: number): Promise<void>;
  complete(
    jobId: string,
    result: { outcome: "completed" | "failed" | "cancelled"; error?: string },
  ): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
  loadLocked(jobId: string): Promise<ExecuteTaskJob | null>;
};

async function moveJob(
  paths: Paths,
  runtimeId: string,
  from: JobStatus,
  to: JobStatus,
  jobId: string,
): Promise<string> {
  const src = paths.jobFile(runtimeId, from, jobId);
  const dst = paths.jobFile(runtimeId, to, jobId);
  await mkdir(path.dirname(dst), { recursive: true });
  await rename(src, dst);
  return dst;
}

export function createJobQueue(paths: Paths, runtimeId: string): JobQueue {
  return {
    async enqueueExecuteTask(input) {
      const id = newId("job");
      const job: ExecuteTaskJob = ExecuteTaskJobSchema.parse({
        id,
        type: "execute_task",
        taskId: input.taskId,
        threadId: input.threadId,
        planRevisionId: input.planRevisionId,
        assignedAt: new Date().toISOString(),
        fencingToken: input.fencingToken,
        budget: input.budget,
      });
      await mkdir(paths.jobsDir(runtimeId, "pending"), { recursive: true });
      await writeJson(paths.jobFile(runtimeId, "pending", id), job);
      return job;
    },

    async leaseNext({ lockHolder, leaseMs }) {
      const dir = paths.jobsDir(runtimeId, "pending");
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
      const first = files[0];
      if (!first) return null;
      const id = first.slice(0, -".json".length);
      const file = paths.jobFile(runtimeId, "pending", id);
      const cur = await readJson(file);
      if (!cur) return null;
      const job = ExecuteTaskJobSchema.parse(cur);
      const leased: ExecuteTaskJob = ExecuteTaskJobSchema.parse({
        ...job,
        lockHolder,
        leaseExpireAt: new Date(Date.now() + leaseMs).toISOString(),
      });
      const dst = paths.jobFile(runtimeId, "locked", id);
      await mkdir(path.dirname(dst), { recursive: true });
      await writeJson(dst, leased);
      try {
        await rename(file, `${file}.recovered`).catch(() => undefined);
      } catch {
        /* tolerate */
      }
      return leased;
    },

    async heartbeat(jobId, leaseMs) {
      const file = paths.jobFile(runtimeId, "locked", jobId);
      const cur = await readJson(file);
      if (!cur) throw new Error(`locked job not found: ${jobId}`);
      const job = ExecuteTaskJobSchema.parse(cur);
      const next = ExecuteTaskJobSchema.parse({
        ...job,
        leaseExpireAt: new Date(Date.now() + leaseMs).toISOString(),
      });
      await writeJson(file, next);
    },

    async complete(jobId, result) {
      const dst = await moveJob(paths, runtimeId, "locked", "done", jobId);
      const cur = await readJson(dst);
      if (cur) {
        await writeJson(dst, {
          ...cur,
          completedAt: new Date().toISOString(),
          outcome: result.outcome,
          error: result.error,
        });
      }
    },

    async fail(jobId, error) {
      const dst = await moveJob(paths, runtimeId, "locked", "failed", jobId);
      const cur = await readJson(dst);
      if (cur) {
        await writeJson(dst, {
          ...cur,
          failedAt: new Date().toISOString(),
          lastError: error,
        });
      }
    },

    async loadLocked(jobId) {
      const raw = await readJson(paths.jobFile(runtimeId, "locked", jobId));
      return raw ? ExecuteTaskJobSchema.parse(raw) : null;
    },
  };
}
