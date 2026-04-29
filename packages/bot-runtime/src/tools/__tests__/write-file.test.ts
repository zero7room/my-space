import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createWriteFileTool } from "../write-file.js";

describe("write_file", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "wf-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("creates parent dirs and writes content", async () => {
    const paths = createPaths(dataRoot);
    const tool = createWriteFileTool(paths);
    const out = (await tool.call(
      { path: "deep/nested/file.txt", content: "hi" },
      { ctx: ctx() },
    )) as { bytesWritten: number };
    expect(out.bytesWritten).toBe(2);
    const ws = paths.workspace("rt-1", ctx().threadId, ctx().taskId);
    expect(await readFile(path.join(ws, "deep/nested/file.txt"), "utf8")).toBe("hi");
  });

  it("rejects writes outside the workspace", async () => {
    const paths = createPaths(dataRoot);
    const tool = createWriteFileTool(paths);
    await expect(
      tool.call({ path: "../escape.txt", content: "x" }, { ctx: ctx() }),
    ).rejects.toThrow(/outside workspace/);
  });
});
