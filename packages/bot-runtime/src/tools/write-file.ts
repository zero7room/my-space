import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Paths } from "../storage/paths.js";
import { resolveInsideWorkspace } from "./_workspace-resolver.js";
import { type Tool, defineTool } from "./tool.js";

export function createWriteFileTool(paths: Paths): Tool {
  return defineTool({
    name: "write_file",
    description:
      "Write a UTF-8 file inside the task workspace. Creates parent directories as needed.",
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      path: z.string(),
      content: z.string(),
      mode: z.enum(["create_or_overwrite", "create_only"]).default("create_or_overwrite"),
    }),
    output: z.object({ bytesWritten: z.number().int().nonnegative() }),
    async call({ path: rel, content, mode }, { ctx }) {
      const abs = resolveInsideWorkspace(paths, ctx, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      const flag = mode === "create_only" ? "wx" : "w";
      await writeFile(abs, content, { encoding: "utf8", flag });
      return { bytesWritten: Buffer.byteLength(content, "utf8") };
    },
  });
}
