import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createListDirTool } from "../list-dir.js";
import { createReadFileTool } from "../read-file.js";

describe("read_file and list_dir", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rfls-"));
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

  async function setupWorkspace() {
    const paths = createPaths(dataRoot);
    const ws = paths.workspace("rt-1", ctx().threadId, ctx().taskId);
    await mkdir(ws, { recursive: true });
    await writeFile(path.join(ws, "hello.txt"), "world");
    await mkdir(path.join(ws, "sub"), { recursive: true });
    await writeFile(path.join(ws, "sub/inner.txt"), "x");
    return paths;
  }

  it("read_file reads relative paths inside workspace", async () => {
    const paths = await setupWorkspace();
    const tool = createReadFileTool(paths);
    const out = await tool.call({ path: "hello.txt" }, { ctx: ctx() });
    expect((out as { content: string }).content).toBe("world");
  });

  it("read_file rejects absolute paths and traversal", async () => {
    const paths = await setupWorkspace();
    const tool = createReadFileTool(paths);
    await expect(tool.call({ path: "/etc/passwd" }, { ctx: ctx() })).rejects.toThrow(
      /outside workspace/,
    );
    await expect(tool.call({ path: "../../escape" }, { ctx: ctx() })).rejects.toThrow(
      /outside workspace/,
    );
  });

  it("list_dir returns entries", async () => {
    const paths = await setupWorkspace();
    const tool = createListDirTool(paths);
    const out = (await tool.call({ path: "." }, { ctx: ctx() })) as {
      entries: { name: string; kind: "file" | "dir" }[];
    };
    expect(out.entries.map((e) => e.name).sort()).toEqual(["hello.txt", "sub"]);
  });
});
