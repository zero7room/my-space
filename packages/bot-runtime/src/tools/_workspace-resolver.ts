import path from "node:path";
import type { Paths } from "../storage/paths.js";
import type { ToolContext } from "./tool.js";

export function resolveInsideWorkspace(
  paths: Paths,
  ctx: ToolContext,
  rel: string,
): string {
  const ws = paths.workspace(ctx.runtimeId, ctx.threadId, ctx.taskId);
  const abs = path.resolve(ws, rel);
  const wsAbs = path.resolve(ws);
  if (abs !== wsAbs && !abs.startsWith(`${wsAbs}${path.sep}`)) {
    throw new Error(`path resolves outside workspace: ${rel}`);
  }
  return abs;
}
