import { describe, expect, it } from "vitest";
import { ExecuteTaskJobSchema, TaskControlSchema } from "../job.js";

describe("Job schemas", () => {
  it("ExecuteTaskJob has fencingToken and budget optional", () => {
    const j = ExecuteTaskJobSchema.parse({
      id: "job_018f5d20-0000-7000-8000-000000000001",
      type: "execute_task",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      planRevisionId: "rv_018f5d20-0000-7000-8000-000000000001",
      assignedAt: "2026-04-28T00:00:00Z",
      fencingToken: 1000001,
    });
    expect(j.fencingToken).toBe(1000001);
  });

  it("TaskControl signal optional", () => {
    const empty = TaskControlSchema.parse({
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 0,
    });
    expect(empty.signal).toBeUndefined();
    const revise = TaskControlSchema.parse({
      signal: "revise",
      revisionId: "rv-2",
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 1000003,
    });
    expect(revise.signal).toBe("revise");
  });
});
