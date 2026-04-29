import type { CriticalNodePolicy } from "../schema/critical-node.js";

export type EvaluateInput = {
  toolName: string;
  input: Record<string, unknown>;
  policies: CriticalNodePolicy[];
};

export type CriticalNodeDecision = {
  policyId: string;
  action: CriticalNodePolicy["action"];
  reason: string;
};

export function evaluateCriticalNode(input: EvaluateInput): CriticalNodeDecision[] {
  const out: CriticalNodeDecision[] = [];
  for (const p of input.policies) {
    if (!p.enabled) continue;
    const m = p.matcher;
    let hit = false;
    let reason = "";
    if (m.kind === "tool" && m.toolName === input.toolName) {
      hit = true;
      reason = `tool name match: ${m.toolName}`;
    } else if (m.kind === "external_io") {
      const direction = (input.input as { direction?: string }).direction;
      if (direction === "outbound") {
        hit = true;
        reason = "external outbound io";
      }
    } else if (m.kind === "filesystem") {
      const fs = (input.input as { fsImpact?: { op?: string; count?: number } }).fsImpact;
      if (fs?.op === m.op && (m.minCount === undefined || (fs.count ?? 0) >= m.minCount)) {
        hit = true;
        reason = `fs ${m.op} ${fs.count ?? "?"}`;
      }
    } else if (m.kind === "budget_overflow") {
      const b = (input.input as { budgetOverflow?: { dim: string } }).budgetOverflow;
      if (b?.dim === m.dim) {
        hit = true;
        reason = `budget overflow on ${m.dim}`;
      }
    } else if (m.kind === "out_of_scope") {
      const rev = (input.input as { planRevisionId?: string }).planRevisionId;
      if (rev && rev !== m.planRevisionId) {
        hit = true;
        reason = `out of scope from ${m.planRevisionId}`;
      }
    }
    if (hit) {
      out.push({ policyId: p.id, action: p.action, reason });
    }
  }
  return out;
}
