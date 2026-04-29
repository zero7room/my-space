import { describe, expect, it } from "vitest";
import { TaskSchema, TaskStatusSchema, isTerminalTaskStatus } from "../task.js";

describe("TaskSchema", () => {
  it("includes all 10 statuses", () => {
    expect(TaskStatusSchema.options).toEqual([
      "draft",
      "confirmed",
      "queued",
      "running",
      "awaiting_critical_node",
      "blocked",
      "changing",
      "completed",
      "failed",
      "cancelled",
    ]);
  });

  it("accepts a minimal draft task", () => {
    const t = TaskSchema.parse({
      id: "tk_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      title: "do thing",
      description: "...",
      status: "draft",
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(t.budget).toBeUndefined();
  });

  it("accepts task with budget and confirmedByUserId", () => {
    const t = TaskSchema.parse({
      id: "tk_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      confirmedByUserId: "u_018f5d20-0000-7000-8000-000000000001",
      title: "do thing",
      description: "...",
      status: "confirmed",
      sourceMessageIds: ["msg-1"],
      budget: { maxDurationMs: 3600000, maxTokens: 100000 },
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(t.budget?.maxTokens).toBe(100000);
  });

  it("isTerminalTaskStatus marks completed/failed/cancelled", () => {
    expect(isTerminalTaskStatus("completed")).toBe(true);
    expect(isTerminalTaskStatus("failed")).toBe(true);
    expect(isTerminalTaskStatus("cancelled")).toBe(true);
    expect(isTerminalTaskStatus("running")).toBe(false);
    expect(isTerminalTaskStatus("blocked")).toBe(false);
  });
});
