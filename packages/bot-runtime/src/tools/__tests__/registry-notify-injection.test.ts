import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createChannelOutboundJobQueue } from "../../channel/outbound-job-queue.js";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createDefaultToolRegistry } from "../registry.js";

describe("createDefaultToolRegistry — notify_bound_channel injection", () => {
  it("uses the real notify_bound_channel when channelDeps is provided", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "reg-inj-"));
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, "rt_test");
    const queue = createChannelOutboundJobQueue(paths, "rt_test");
    const threadId = newId("th");
    const taskRepo = createTaskRepo(paths, "rt_test");
    const planRepo = createPlanRepo(paths, "rt_test");
    const tools = createDefaultToolRegistry({
      paths,
      taskRepo,
      planRepo,
      channelDeps: { bindingRepo, queue, threadId },
    });
    const tool = tools.find((t) => t.name === "notify_bound_channel");
    expect(tool).toBeDefined();
    const out = await tool!.call(
      { target: "all", message: "x", importance: "info" },
      { ctx: {} as never },
    );
    // No bindings → real tool returns binding_unavailable WITHOUT reason "channel deps not provided"
    expect(out.status).toBe("binding_unavailable");
    expect(out.reason).not.toContain("channel deps not provided");
  });

  it("falls back to legacy stub when channelDeps is omitted", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "reg-inj-"));
    const paths = createPaths(tmp);
    const taskRepo = createTaskRepo(paths, "rt_test");
    const planRepo = createPlanRepo(paths, "rt_test");
    const tools = createDefaultToolRegistry({
      paths,
      taskRepo,
      planRepo,
    });
    const tool = tools.find((t) => t.name === "notify_bound_channel");
    expect(tool).toBeDefined();
    const out = await tool!.call(
      { target: "all", message: "x", importance: "info" },
      { ctx: {} as never },
    );
    expect(out.status).toBe("binding_unavailable");
    expect(out.reason).toContain("channel deps not provided");
  });
});
