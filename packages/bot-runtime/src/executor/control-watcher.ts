import { type TaskControl, TaskControlSchema } from "../schema/job.js";
import { readJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export async function readControl(
  paths: Paths,
  runtimeId: string,
  threadId: string,
  taskId: string,
  opts?: { lastSeen?: number },
): Promise<TaskControl | null> {
  const raw = await readJson(paths.taskControl(runtimeId, threadId, taskId));
  if (!raw) return null;
  const parsed = TaskControlSchema.parse(raw);
  if (opts?.lastSeen !== undefined && parsed.signalFencingToken <= opts.lastSeen) {
    return null;
  }
  return parsed;
}
