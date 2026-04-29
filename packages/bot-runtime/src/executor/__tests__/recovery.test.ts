import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createEventsWriter } from "../events-writer.js";
import { detectInFlightToolCall } from "../recovery.js";

describe("detectInFlightToolCall", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "exr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("returns null when last event is not tool_call", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "executor_started",
      executorId: "e1",
      fencingToken: 1,
      at: "2026-04-28T00:00:00Z",
    });
    expect(await detectInFlightToolCall(paths, "rt-1", "th-1", "tk-1")).toBeNull();
  });

  it("returns the unmatched tool_call when not followed by tool_result", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "tool_call",
      toolName: "write_file",
      argsRef: "x",
      at: "2026-04-28T00:00:01Z",
    });
    const got = await detectInFlightToolCall(paths, "rt-1", "th-1", "tk-1");
    expect(got?.toolName).toBe("write_file");
  });

  it("returns null when matched tool_result follows", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "tool_call",
      toolName: "write_file",
      argsRef: "x",
      at: "2026-04-28T00:00:01Z",
    });
    await w.write({
      kind: "tool_result",
      toolName: "write_file",
      resultRef: "y",
      at: "2026-04-28T00:00:02Z",
    });
    expect(await detectInFlightToolCall(paths, "rt-1", "th-1", "tk-1")).toBeNull();
  });
});
