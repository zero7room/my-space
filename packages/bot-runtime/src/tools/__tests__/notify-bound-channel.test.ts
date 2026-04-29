import { describe, expect, it } from "vitest";
import { createNotifyBoundChannelTool } from "../notify-bound-channel.js";

describe("notify_bound_channel (Plan 1 stub)", () => {
  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th-1",
      taskId: "tk-1",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("requires explicit target", async () => {
    const tool = createNotifyBoundChannelTool();
    await expect(
      tool.call({ message: "hi", importance: "info" } as never, { ctx: ctx() }),
    ).rejects.toThrow();
  });

  it("returns binding_unavailable status in Plan 1 stub", async () => {
    const tool = createNotifyBoundChannelTool();
    const out = (await tool.call(
      { target: "all", message: "hi", importance: "info" },
      { ctx: ctx() },
    )) as { status: string };
    expect(out.status).toBe("binding_unavailable");
  });
});
