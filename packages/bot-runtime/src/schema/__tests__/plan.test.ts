import { describe, expect, it } from "vitest";
import { PlanRevisionSchema, PlanSchema, PlanStepSchema } from "../plan.js";

describe("PlanSchema", () => {
  it("accepts a draft plan with one step", () => {
    const p = PlanSchema.parse({
      id: "pl_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      status: "draft",
      objective: "do x",
      steps: [
        {
          id: "step-1",
          title: "first",
          status: "pending",
        },
      ],
      expectedArtifacts: [],
      revisionIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(p.steps[0]?.status).toBe("pending");
  });

  it("plan revision is a snapshot with reason and archived artifacts", () => {
    const r = PlanRevisionSchema.parse({
      id: "rv_018f5d20-0000-7000-8000-000000000001",
      planId: "pl_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      status: "active",
      fullPlan: {
        id: "pl_018f5d20-0000-7000-8000-000000000001",
        taskId: "tk_018f5d20-0000-7000-8000-000000000001",
        status: "active",
        objective: "do x",
        steps: [],
        expectedArtifacts: [],
        revisionIds: [],
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      },
      reason: "user pivot",
      sourceMessageId: "msg-1",
      archivedArtifactPaths: [],
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(r.fullPlan.objective).toBe("do x");
  });

  it("PlanStepSchema enforces all status values", () => {
    expect(PlanStepSchema.shape.status.options).toEqual([
      "pending",
      "in_progress",
      "completed",
      "blocked",
      "skipped",
      "superseded",
      "failed",
    ]);
  });
});
