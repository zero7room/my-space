import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Paths } from "../storage/paths.js";
import { resolveInsideWorkspace } from "./_workspace-resolver.js";
import { defineTool, type Tool } from "./tool.js";

export function createReadFileTool(paths: Paths): Tool {
  return defineTool({
    name: "read_file",
    description: "Read a UTF-8 file inside the task workspace.",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({ path: z.string() }),
    output: z.object({ content: z.string() }),
    async call({ path: rel }, { ctx }) {
      const abs = resolveInsideWorkspace(paths, ctx, rel);
      const content = await readFile(abs, "utf8");
      return { content };
    },
  });
}
