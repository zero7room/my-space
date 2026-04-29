import type { Paths } from "../storage/paths.js";
import {
  cleanupRecoveredTombstones,
  cleanupStaleDedupe,
  markStaleRunningTasks,
  recoverStaleLockedJobs,
} from "../storage/recovery.js";

export type RecoverOnBootSummary = {
  staleLockedJobs: string[];
  staleRunningTasks: string[];
  cleanedDedupeKeys: string[];
  cleanedTombstones: number;
};

export async function recoverOnBoot(
  paths: Paths,
  runtimeId: string,
  opts: { dedupeRetentionDays: number },
): Promise<RecoverOnBootSummary> {
  const staleLockedJobs = await recoverStaleLockedJobs(paths, runtimeId);
  const staleRunningTasks = await markStaleRunningTasks(paths, runtimeId);
  const cleanedDedupeKeys = await cleanupStaleDedupe(
    paths,
    runtimeId,
    opts.dedupeRetentionDays,
  );
  const cleanedTombstones = await cleanupRecoveredTombstones(paths, runtimeId);
  return {
    staleLockedJobs,
    staleRunningTasks,
    cleanedDedupeKeys,
    cleanedTombstones,
  };
}
