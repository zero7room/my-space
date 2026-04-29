import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Paths } from "../storage/paths.js";
import { resolveInsideWorkspace } from "./_workspace-resolver.js";
import { type Tool, defineTool } from "./tool.js";

export function createListDirTool(paths: Paths): Tool {
  return defineTool({
    name: "list_dir",
    description: "List entries inside a directory under the workspace.",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({ path: z.string() }),
    output: z.object({
      entries: z.array(z.object({ name: z.string(), kind: z.enum(["file", "dir"]) })),
    }),
    async call({ path: rel }, { ctx }) {
      const abs = resolveInsideWorkspace(paths, ctx, rel);
      const names = await readdir(abs);
      const entries = await Promise.all(
        names.map(async (name) => ({
          name,
          kind: ((await stat(path.join(abs, name))).isDirectory() ? "dir" : "file") as
            | "dir"
            | "file",
        })),
      );
      return { entries };
    },
  });
}
