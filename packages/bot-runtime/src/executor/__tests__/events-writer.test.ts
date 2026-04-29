import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonl } from "../../storage/jsonl.js";
import { createPaths } from "../../storage/paths.js";
import { createEventsWriter } from "../events-writer.js";

describe("EventsWriter", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ew-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("appends valid ExecutorEvents", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "executor_started",
      executorId: "exec-1",
      fencingToken: 1000001,
      at: "2026-04-28T00:00:00Z",
    });
    await w.write({
      kind: "tool_call",
      toolName: "read_file",
      argsRef: "x",
      at: "2026-04-28T00:00:01Z",
    });
    const all = await readJsonl(paths.taskEvents("rt-1", "th-1", "tk-1"));
    expect(all).toHaveLength(2);
  });

  it("rejects events failing schema", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await expect(w.write({ kind: "wat", at: "2026-04-28T00:00:00Z" } as never)).rejects.toThrow();
  });
});
