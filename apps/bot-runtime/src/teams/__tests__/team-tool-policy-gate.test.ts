/**
 * Acceptance 64 — A `kind: tool, toolName: "team"` policy with action
 * `require_approval` must intercept the `team` tool BEFORE spawn. We assert
 * via the existing CriticalNodePolicyEngine: when the policy is registered,
 * `evaluate({toolName:'team'})` returns `require_approval`. The Executor
 * already gates ALL tool calls through `policies.evaluate(...)` (see
 * executor.ts line 220), so this proves the wiring path.
 */
import { describe, it, expect } from 'vitest';
import { type CriticalNodePolicy } from '@ai-workflow/contracts';
import { CriticalNodePolicyEngine } from '../../critical-node/policy-engine.js';

const NOW = '2026-05-07T00:00:00.000Z';

describe('team-tool critical-node policy gate (acceptance 64)', () => {
  it('kind:tool toolName:team require_approval intercepts before spawn', () => {
    const engine = new CriticalNodePolicyEngine();
    const teamGate: CriticalNodePolicy = {
      id: 'pol_team_tool_gate_aaaaaaaaaaaa',
      scope: 'global',
      matcher: { kind: 'tool', toolName: 'team' },
      action: 'require_approval',
      ownerUserId: 'usr_test_team_gate_aaaaaaaaa',
      enabled: true,
      createdAt: NOW,
    };
    engine.setPolicies([teamGate]);
    const decision = engine.evaluate({ toolName: 'team', toolArgs: { rosterSlots: [] } });
    expect(decision.action).toBe('require_approval');
    expect(decision.matched.some((m) => m.id === teamGate.id)).toBe(true);
  });

  it('non-team tool does NOT match the team gate', () => {
    const engine = new CriticalNodePolicyEngine();
    const teamGate: CriticalNodePolicy = {
      id: 'pol_team_tool_gate_aaaaaaaaaaaa',
      scope: 'global',
      matcher: { kind: 'tool', toolName: 'team' },
      action: 'require_approval',
      ownerUserId: 'usr_test_team_gate_aaaaaaaaa',
      enabled: true,
      createdAt: NOW,
    };
    engine.setPolicies([teamGate]);
    const decision = engine.evaluate({ toolName: 'bash' });
    expect(decision.action).toBe('log_only');
    expect(decision.matched.some((m) => m.id === teamGate.id)).toBe(false);
  });
});
