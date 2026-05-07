/**
 * CriticalNodePolicy evaluator. Composes:
 *   - Built-in baseline (always: high-risk skills require approval).
 *   - Global / user / thread / skill scopes (loaded via repo).
 *
 * Resolution: any matching policy with stricter action takes precedence.
 *   strictness order: block > require_approval > log_only.
 *
 * Lower scopes (user, thread, skill) cannot weaken built-in or global "block"
 * actions; the resolver enforces this by taking the maximum strictness across
 * matches.
 *
 * Re-evaluated before EVERY tool dispatch — including retry and teammate
 * paths. Hot reload: `setPolicies(...)` swaps the active list atomically.
 */
import {
  type CriticalNodePolicy,
  type NodeMatcher,
  type RiskClass,
  type SkillManifest,
} from '@ai-workflow/contracts';

export type Action = 'log_only' | 'require_approval' | 'block';

export interface PolicyRequest {
  toolName: string;
  toolArgs?: Record<string, unknown>;
  skillName?: string;
  skillRiskClass?: RiskClass;
  externalIo?: { direction: 'outbound'; provider?: string };
  filesystem?: { op: 'delete' | 'overwrite'; pathCount?: number };
  budgetOverflow?: 'time' | 'tokens' | 'subagents' | 'cost';
  outOfScope?: { planRevisionId: string };
}

export interface PolicyDecision {
  action: Action;
  matched: CriticalNodePolicy[];
  reason: string;
}

const STRICTNESS: Record<Action, number> = {
  log_only: 0,
  require_approval: 1,
  block: 2,
};

const BUILTIN_HIGH_RISK_APPROVAL: CriticalNodePolicy = {
  id: 'pol_builtin_high_risk_skill_appro',
  scope: 'global',
  matcher: { kind: 'skill', riskClass: 'high' },
  action: 'require_approval',
  ownerUserId: 'usr_builtin_aaaaaaaaaaaaaaaa',
  enabled: true,
  createdAt: '2026-05-06T00:00:00.000Z',
};

export class CriticalNodePolicyEngine {
  private policies: CriticalNodePolicy[] = [BUILTIN_HIGH_RISK_APPROVAL];

  setPolicies(policies: CriticalNodePolicy[]): void {
    // Hot reload: built-in baseline always present.
    const dedup = policies.filter((p) => p.id !== BUILTIN_HIGH_RISK_APPROVAL.id);
    this.policies = [BUILTIN_HIGH_RISK_APPROVAL, ...dedup];
  }

  list(): CriticalNodePolicy[] {
    return [...this.policies];
  }

  evaluate(req: PolicyRequest, skillRegistry?: { lookup(name: string): SkillManifest | undefined }): PolicyDecision {
    const matched: CriticalNodePolicy[] = [];
    let resolvedSkillRisk: RiskClass | undefined = req.skillRiskClass;
    if (!resolvedSkillRisk && req.skillName && skillRegistry) {
      resolvedSkillRisk = skillRegistry.lookup(req.skillName)?.riskClass;
    }

    for (const p of this.policies) {
      if (!p.enabled) continue;
      if (matchesMatcher(p.matcher, { ...req, skillRiskClass: resolvedSkillRisk })) {
        matched.push(p);
      }
    }
    let strongest: Action = 'log_only';
    for (const m of matched) {
      if (STRICTNESS[m.action as Action] > STRICTNESS[strongest]) {
        strongest = m.action as Action;
      }
    }
    return {
      action: strongest,
      matched,
      reason:
        matched.length === 0
          ? 'no policy matched'
          : matched.map((m) => `${m.scope}:${m.matcher.kind}`).join(','),
    };
  }
}

function matchesMatcher(m: NodeMatcher, req: PolicyRequest): boolean {
  switch (m.kind) {
    case 'tool':
      if (m.toolName !== req.toolName) return false;
      if (!m.argMatch) return true;
      return Object.entries(m.argMatch).every(
        ([k, v]) => req.toolArgs?.[k] === v,
      );
    case 'skill':
      if (m.skillName && req.skillName !== m.skillName) return false;
      if (m.riskClass && req.skillRiskClass !== m.riskClass) return false;
      return true;
    case 'external_io':
      if (!req.externalIo) return false;
      if (req.externalIo.direction !== m.direction) return false;
      if (m.provider && req.externalIo.provider !== m.provider) return false;
      return true;
    case 'filesystem':
      if (!req.filesystem) return false;
      if (req.filesystem.op !== m.op) return false;
      if (m.minCount && (req.filesystem.pathCount ?? 0) < m.minCount) return false;
      return true;
    case 'budget_overflow':
      return req.budgetOverflow === m.dim;
    case 'out_of_scope':
      return Boolean(
        req.outOfScope && req.outOfScope.planRevisionId === m.planRevisionId,
      );
  }
}
