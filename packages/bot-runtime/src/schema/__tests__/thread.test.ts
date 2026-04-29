import { describe, expect, it } from "vitest";
import { ThreadSchema, ThreadStatusSchema } from "../thread.js";

describe("ThreadSchema", () => {
  it("status enum has all 6 values", () => {
    expect(ThreadStatusSchema.options).toEqual([
      "chatting",
      "planning",
      "waiting_confirmation",
      "working",
      "blocked",
      "idle",
    ]);
  });

  it("accepts a minimal thread", () => {
    const t = ThreadSchema.parse({
      id: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      title: "demo",
      status: "chatting",
      taskListId: "tl-1",
      channelBindingIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(t.activeTaskId).toBeUndefined();
    expect(t.channelBindingIds).toEqual([]);
  });

  it("rejects unknown status", () => {
    expect(() =>
      ThreadSchema.parse({
        id: "th_018f5d20-0000-7000-8000-000000000001",
        ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
        title: "x",
        status: "weird",
        taskListId: "tl-1",
        channelBindingIds: [],
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      }),
    ).toThrow();
  });
});
