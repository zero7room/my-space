import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../storage/json-file.js";
import { createPaths } from "../../storage/paths.js";
import { readControl } from "../control-watcher.js";

describe("readControl", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ctl-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("returns null when no control file", async () => {
    const paths = createPaths(dataRoot);
    expect(await readControl(paths, "rt-1", "th-1", "tk-1")).toBeNull();
  });

  it("returns the latest signal", async () => {
    const paths = createPaths(dataRoot);
    await writeJson(paths.taskControl("rt-1", "th-1", "tk-1"), {
      signal: "pause",
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 1,
    });
    const got = await readControl(paths, "rt-1", "th-1", "tk-1");
    expect(got?.signal).toBe("pause");
  });

  it("filters out stale signals based on lastSeenFencingToken", async () => {
    const paths = createPaths(dataRoot);
    await writeJson(paths.taskControl("rt-1", "th-1", "tk-1"), {
      signal: "cancel",
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 5,
    });
    const got = await readControl(paths, "rt-1", "th-1", "tk-1", { lastSeen: 10 });
    expect(got).toBeNull();
  });
});
