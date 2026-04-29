import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createDefaultToolRegistry } from "../registry.js";

describe("default tool registry", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "reg-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("includes all 10 plan-1 tools", () => {
    const paths = createPaths(dataRoot);
    const tools = createDefaultToolRegistry({
      paths,
      taskRepo: createTaskRepo(paths, "rt-1"),
      planRepo: createPlanRepo(paths, "rt-1"),
    });
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "ask_clarification",
      "confirm_critical_node",
      "confirm_plan",
      "confirm_task",
      "list_dir",
      "notify_bound_channel",
      "read_file",
      "update_plan",
      "update_task",
      "write_file",
    ]);
  });
});
