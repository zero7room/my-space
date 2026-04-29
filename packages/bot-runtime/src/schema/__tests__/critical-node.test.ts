import { describe, expect, it } from "vitest";
import { CriticalNodePolicySchema, NodeMatcherSchema } from "../critical-node.js";

describe("CriticalNodePolicySchema", () => {
  it("supports all 5 matcher kinds", () => {
    const cases = [
      { kind: "tool", toolName: "bash" },
      { kind: "external_io", direction: "outbound", provider: "feishu" },
      { kind: "filesystem", op: "delete", minCount: 20 },
      { kind: "budget_overflow", dim: "tokens" },
      { kind: "out_of_scope", planRevisionId: "rv-1" },
    ] as const;
    for (const m of cases) NodeMatcherSchema.parse(m);
  });

  it("rejects unknown matcher kind", () => {
    expect(() => NodeMatcherSchema.parse({ kind: "wat" })).toThrow();
  });

  it("policy requires owner and matcher", () => {
    const p = CriticalNodePolicySchema.parse({
      id: "policy_001",
      scope: "user",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "require_approval",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: true,
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(p.action).toBe("require_approval");
  });
});
