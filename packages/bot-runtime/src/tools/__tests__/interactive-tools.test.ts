import { describe, expect, it } from "vitest";
import { createAskClarificationTool } from "../ask-clarification.js";
import { createConfirmCriticalNodeTool } from "../confirm-critical-node.js";

describe("interactive tools", () => {
  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th-1",
      taskId: "tk-1",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("ask_clarification returns InterruptSignal", async () => {
    const tool = createAskClarificationTool();
    const out = await tool.call(
      { question: "more info?" },
      { ctx: ctx() },
    );
    expect(out).toMatchObject({
      kind: "interrupt",
      reason: "ask_clarification",
      question: "more info?",
    });
  });

  it("confirm_critical_node returns InterruptSignal with policyId", async () => {
    const tool = createConfirmCriticalNodeTool();
    const out = await tool.call(
      {
        policyId: "policy-1",
        action: "require_approval",
        summary: "delete 30 files",
      },
      { ctx: ctx() },
    );
    expect(out).toMatchObject({
      kind: "interrupt",
      reason: "critical_node",
      policyId: "policy-1",
    });
  });
});
