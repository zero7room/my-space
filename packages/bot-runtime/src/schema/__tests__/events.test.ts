import { describe, expect, it } from "vitest";
import { ExecutorEventSchema } from "../events.js";

describe("ExecutorEventSchema", () => {
  it("supports all 9 event kinds", () => {
    const samples = [
      {
        kind: "executor_started",
        executorId: "exec-1",
        fencingToken: 1000001,
        at: "2026-04-28T00:00:00Z",
      },
      {
        kind: "tool_call",
        toolName: "read_file",
        argsRef: "args/x",
        at: "2026-04-28T00:00:01Z",
      },
      {
        kind: "tool_result",
        toolName: "read_file",
        resultRef: "results/x",
        at: "2026-04-28T00:00:02Z",
      },
      {
        kind: "plan_step_updated",
        stepId: "s1",
        status: "completed",
        at: "2026-04-28T00:00:03Z",
      },
      {
        kind: "subagent_spawned",
        subagentId: "sa-1",
        parentStepId: "s1",
        at: "2026-04-28T00:00:04Z",
      },
      {
        kind: "subagent_completed",
        subagentId: "sa-1",
        summaryRef: "sum/sa-1",
        at: "2026-04-28T00:00:05Z",
      },
      {
        kind: "critical_node_hit",
        policyId: "policy-1",
        action: "require_approval",
        at: "2026-04-28T00:00:06Z",
      },
      {
        kind: "executor_paused",
        reason: "control:pause",
        at: "2026-04-28T00:00:07Z",
      },
      {
        kind: "executor_finished",
        outcome: "completed",
        summaryRef: "summary/final",
        at: "2026-04-28T00:00:08Z",
      },
    ];
    for (const s of samples) ExecutorEventSchema.parse(s);
  });

  it("rejects unknown kind", () => {
    expect(() =>
      ExecutorEventSchema.parse({ kind: "wat", at: "2026-04-28T00:00:00Z" }),
    ).toThrow();
  });
});
