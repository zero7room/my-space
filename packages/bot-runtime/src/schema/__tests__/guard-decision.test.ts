import { describe, expect, it } from "vitest";
import { GuardDecisionSchema, GuardIntentSchema } from "../guard-decision.js";

describe("GuardDecisionSchema", () => {
  it("includes all 9 intents", () => {
    expect(GuardIntentSchema.options).toEqual([
      "chat",
      "new_task",
      "task_update",
      "plan_update",
      "confirm_task",
      "confirm_plan",
      "progress_query",
      "cancel_task",
      "irrelevant",
    ]);
  });

  it("short-circuited rule decision has 0 confidence and ruleHits", () => {
    const d = GuardDecisionSchema.parse({
      id: "guard_018f5d20-0000-7000-8000-000000000001",
      messageId: "msg-1",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      source: "lark_group",
      intent: "irrelevant",
      shortCircuited: true,
      ruleHits: ["unbound_group_silence"],
      confidence: 0,
      requiresUserConfirmation: false,
      reason: "unbound group, no @bot",
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(d.shortCircuited).toBe(true);
  });

  it("LLM-based decision can include targetTaskId and fromUserId", () => {
    GuardDecisionSchema.parse({
      id: "guard_018f5d20-0000-7000-8000-000000000002",
      messageId: "msg-2",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      fromUserId: "u_018f5d20-0000-7000-8000-000000000001",
      source: "lark_private",
      intent: "confirm_task",
      targetTaskId: "tk_018f5d20-0000-7000-8000-000000000001",
      shortCircuited: false,
      ruleHits: [],
      confidence: 0.92,
      requiresUserConfirmation: false,
      reason: "explicit confirm",
      createdAt: "2026-04-28T00:00:00Z",
    });
  });
});
