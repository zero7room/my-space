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
});
