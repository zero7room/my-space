import { describe, expect, it } from "vitest";
import type { CriticalNodePolicy } from "../../schema/critical-node.js";
import { evaluateCriticalNode } from "../critical-node-policy.js";

const owner = "u_018f5d20-0000-7000-8000-000000000001";
const policy = (over: Partial<CriticalNodePolicy> = {}): CriticalNodePolicy => ({
  id: "p1",
  scope: "user",
  matcher: { kind: "tool", toolName: "bash" },
  action: "require_approval",
  ownerUserId: owner,
  enabled: true,
  createdAt: "2026-04-28T00:00:00Z",
  ...over,
});

describe("evaluateCriticalNode", () => {
  it("matches tool by name", () => {
    const decisions = evaluateCriticalNode({
      toolName: "bash",
      input: { command: "ls" },
      policies: [policy()],
    });
    expect(decisions.map((d) => d.policyId)).toEqual(["p1"]);
  });

  it("filesystem matcher fires on delete with minCount", () => {
    const decisions = evaluateCriticalNode({
      toolName: "bash",
      input: { fsImpact: { op: "delete", count: 25 } },
      policies: [
        policy({
          id: "p2",
          matcher: { kind: "filesystem", op: "delete", minCount: 20 },
        }),
      ],
    });
    expect(decisions[0]?.policyId).toBe("p2");
  });

  it("returns empty when no matcher fires", () => {
    expect(
      evaluateCriticalNode({
        toolName: "read_file",
        input: {},
        policies: [policy()],
      }),
    ).toEqual([]);
  });

  // external_io matcher
  it("external_io matcher fires on outbound direction", () => {
    const decisions = evaluateCriticalNode({
      toolName: "http_request",
      input: { direction: "outbound", provider: "stripe" },
      policies: [policy({ id: "p-io-1", matcher: { kind: "external_io", direction: "outbound" } })],
    });
    expect(decisions[0]?.policyId).toBe("p-io-1");
    expect(decisions[0]?.reason).toBe("external outbound io");
  });

  it("external_io matcher fires when provider matches", () => {
    const decisions = evaluateCriticalNode({
      toolName: "http_request",
      input: { direction: "outbound", provider: "stripe" },
      policies: [
        policy({
          id: "p-io-2",
          matcher: { kind: "external_io", direction: "outbound", provider: "stripe" },
        }),
      ],
    });
    expect(decisions[0]?.policyId).toBe("p-io-2");
    expect(decisions[0]?.reason).toBe("external outbound io via stripe");
  });

  it("external_io matcher does not fire when provider differs", () => {
    const decisions = evaluateCriticalNode({
      toolName: "http_request",
      input: { direction: "outbound", provider: "sendgrid" },
      policies: [
        policy({
          id: "p-io-3",
          matcher: { kind: "external_io", direction: "outbound", provider: "stripe" },
        }),
      ],
    });
    expect(decisions).toEqual([]);
  });

  it("external_io matcher does not fire on inbound direction", () => {
    const decisions = evaluateCriticalNode({
      toolName: "webhook_receive",
      input: { direction: "inbound" },
      policies: [policy({ id: "p-io-4", matcher: { kind: "external_io", direction: "outbound" } })],
    });
    expect(decisions).toEqual([]);
  });

  // budget_overflow matcher
  it("budget_overflow matcher fires when dim matches", () => {
    const decisions = evaluateCriticalNode({
      toolName: "any_tool",
      input: { budgetOverflow: { dim: "tokens" } },
      policies: [policy({ id: "p-budget-1", matcher: { kind: "budget_overflow", dim: "tokens" } })],
    });
    expect(decisions[0]?.policyId).toBe("p-budget-1");
    expect(decisions[0]?.reason).toBe("budget overflow on tokens");
  });

  it("budget_overflow matcher does not fire when dim differs", () => {
    const decisions = evaluateCriticalNode({
      toolName: "any_tool",
      input: { budgetOverflow: { dim: "time" } },
      policies: [policy({ id: "p-budget-2", matcher: { kind: "budget_overflow", dim: "tokens" } })],
    });
    expect(decisions).toEqual([]);
  });

  it("budget_overflow matcher does not fire when no budgetOverflow in input", () => {
    const decisions = evaluateCriticalNode({
      toolName: "any_tool",
      input: {},
      policies: [policy({ id: "p-budget-3", matcher: { kind: "budget_overflow", dim: "cost" } })],
    });
    expect(decisions).toEqual([]);
  });

  // out_of_scope matcher
  it("out_of_scope matcher fires when planRevisionId differs from policy", () => {
    const decisions = evaluateCriticalNode({
      toolName: "any_tool",
      input: { planRevisionId: "rev-99" },
      policies: [
        policy({
          id: "p-oos-1",
          matcher: { kind: "out_of_scope", planRevisionId: "rev-1" },
        }),
      ],
    });
    expect(decisions[0]?.policyId).toBe("p-oos-1");
    expect(decisions[0]?.reason).toBe("out of scope from rev-1");
  });

  it("out_of_scope matcher does not fire when planRevisionId matches", () => {
    const decisions = evaluateCriticalNode({
      toolName: "any_tool",
      input: { planRevisionId: "rev-1" },
      policies: [
        policy({
          id: "p-oos-2",
          matcher: { kind: "out_of_scope", planRevisionId: "rev-1" },
        }),
      ],
    });
    expect(decisions).toEqual([]);
  });

  it("out_of_scope matcher does not fire when no planRevisionId in input", () => {
    const decisions = evaluateCriticalNode({
      toolName: "any_tool",
      input: {},
      policies: [
        policy({
          id: "p-oos-3",
          matcher: { kind: "out_of_scope", planRevisionId: "rev-1" },
        }),
      ],
    });
    expect(decisions).toEqual([]);
  });
});
