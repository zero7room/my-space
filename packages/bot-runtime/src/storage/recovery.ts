import { mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "./json-file.js";
import type { Paths } from "./paths.js";

export type LockedJob = {
  id: string;
  leaseExpireAt: string;
  lockHolder: string;
  [key: string]: unknown;
};

export async function recoverStaleLockedJobs(paths: Paths, runtimeId: string): Promise<string[]> {
  const lockedDir = paths.jobsDir(runtimeId, "locked");
  const failedDir = paths.jobsDir(runtimeId, "failed");
  await mkdir(lockedDir, { recursive: true });
  await mkdir(failedDir, { recursive: true });
  const files = await readdir(lockedDir);
  const now = Date.now();
  const moved: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const filePath = path.join(lockedDir, f);
    const job = await readJson<LockedJob>(filePath);
    if (!job?.leaseExpireAt) continue;
    if (Date.parse(job.leaseExpireAt) < now) {
      const target = path.join(failedDir, f);
      const failureRecord = {
        ...job,
        recoveredAt: new Date().toISOString(),
        failureReason: "lease_expired_on_recovery",
      };
      await writeJson(target, failureRecord);
      await rename(filePath, `${filePath}.recovered`).catch(() => undefined);
      moved.push(job.id);
    }
  }
  return moved;
}

export async function markStaleRunningTasks(paths: Paths, runtimeId: string): Promise<string[]> {
  const threadsRoot = paths.threadsRoot(runtimeId);
  await mkdir(threadsRoot, { recursive: true });
  const flipped: string[] = [];
  let threads: string[] = [];
  try {
    threads = await readdir(threadsRoot);
  } catch {
    return flipped;
  }
  const lockedFiles = new Set<string>();
  try {
    for (const f of await readdir(paths.jobsDir(runtimeId, "locked"))) {
      if (f.endsWith(".json")) {
        const job = await readJson<{ taskId?: string }>(
          path.join(paths.jobsDir(runtimeId, "locked"), f),
        );
        if (job?.taskId) lockedFiles.add(job.taskId);
      }
    }
  } catch {
    /* no locked dir */
  }
  for (const th of threads) {
    let taskIds: string[] = [];
    try {
      taskIds = await readdir(path.join(threadsRoot, th, "tasks"));
    } catch {
      continue;
    }
    for (const tk of taskIds) {
      const tj = paths.taskJson(runtimeId, th, tk);
      const task = await readJson<{ status?: string }>(tj);
      if (!task) continue;
      if (task.status === "running" && !lockedFiles.has(tk)) {
        await writeJson(tj, { ...task, status: "blocked" });
        flipped.push(tk);
      }
    }
  }
  return flipped;
}

export async function cleanupStaleDedupe(
  paths: Paths,
  runtimeId: string,
  retentionDays: number,
): Promise<string[]> {
  const dir = paths.jobsDir(runtimeId, "dedupe");
  await mkdir(dir, { recursive: true });
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const cleaned: string[] = [];
  for (const f of await readdir(dir)) {
    const fp = path.join(dir, f);
    const s = await stat(fp);
    if (s.mtimeMs < cutoff) {
      await unlink(fp);
      cleaned.push(f);
    }
  }
  return cleaned;
}

export async function cleanupRecoveredTombstones(paths: Paths, runtimeId: string): Promise<number> {
  const dirs = ["pending", "locked", "done", "failed"] as const;
  let count = 0;
  for (const d of dirs) {
    const dir = paths.jobsDir(runtimeId, d);
    await mkdir(dir, { recursive: true });
    for (const f of await readdir(dir)) {
      if (f.endsWith(".recovered")) {
        await unlink(path.join(dir, f));
        count++;
      }
    }
  }
  return count;
}
