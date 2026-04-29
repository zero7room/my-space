import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "./json-file.js";
import type { Paths } from "./paths.js";

export type LockedJob = {
  id: string;
  leaseExpireAt: string;
  lockHolder: string;
  [key: string]: unknown;
};

export async function recoverStaleLockedJobs(
  paths: Paths,
  runtimeId: string,
): Promise<string[]> {
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
