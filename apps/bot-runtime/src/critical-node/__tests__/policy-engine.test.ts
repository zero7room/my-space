import { describe, it, expect } from 'vitest';

import {
  CriticalNodePolicyEngine,
  type Action,
} from '../policy-engine.js';
import {
  newPolicyId,
  newUserId,
  type CriticalNodePolicy,
} from '@ai-workflow/contracts';

const NOW = '2026-05-07T00:00:00.000Z';

const policy = (over: Partial<CriticalNodePolicy>): CriticalNodePolicy => ({
  id: newPolicyId(),
  scope: 'global',
  matcher: { kind: 'tool', toolName: 'bash' },
  action: 'log_only',
  ownerUserId: newUserId(),
  enabled: true,
  createdAt: NOW,
  ...over,
});

describe('CriticalNodePolicyEngine', () => {
  it('built-in high-risk skill always requires approval', () => {
    const e = new CriticalNodePolicyEngine();
    const d = e.evaluate({ toolName: 'write_file', skillRiskClass: 'high' });
    expect(d.action).toBe('require_approval');
  });

  it('strictness order: block > require_approval > log_only', () => {
    const e = new CriticalNodePolicyEngine();
    e.setPolicies([
      policy({ matcher: { kind: 'tool', toolName: 'bash' }, action: 'log_only' as Action }),
      policy({ matcher: { kind: 'tool', toolName: 'bash' }, action: 'require_approval' as Action }),
      policy({ matcher: { kind: 'tool', toolName: 'bash' }, action: 'block' as Action }),
    ]);
    expect(e.evaluate({ toolName: 'bash' }).action).toBe('block');
  });

  it('matches filesystem op', () => {
    const e = new CriticalNodePolicyEngine();
    e.setPolicies([
      policy({
        matcher: { kind: 'filesystem', op: 'delete', minCount: 5 },
        action: 'require_approval',
      }),
    ]);
    expect(
      e.evaluate({
        toolName: 'rm',
        filesystem: { op: 'delete', pathCount: 10 },
      }).action,
    ).toBe('require_approval');
    expect(
      e.evaluate({
        toolName: 'rm',
        filesystem: { op: 'delete', pathCount: 1 },
      }).action,
    ).toBe('log_only');
  });

  it('matches external_io and budget_overflow', () => {
    const e = new CriticalNodePolicyEngine();
    e.setPolicies([
      policy({
        matcher: { kind: 'external_io', direction: 'outbound', provider: 'feishu' },
        action: 'require_approval',
      }),
      policy({
        matcher: { kind: 'budget_overflow', dim: 'tokens' },
        action: 'block',
      }),
    ]);
    expect(
      e.evaluate({ toolName: 'post_message', externalIo: { direction: 'outbound', provider: 'feishu' } }).action,
    ).toBe('require_approval');
    expect(e.evaluate({ toolName: 'noop', budgetOverflow: 'tokens' }).action).toBe('block');
  });

  it('hot reload updates next evaluation', () => {
    const e = new CriticalNodePolicyEngine();
    expect(e.evaluate({ toolName: 'bash' }).action).toBe('log_only');
    e.setPolicies([
      policy({ matcher: { kind: 'tool', toolName: 'bash' }, action: 'block' }),
    ]);
    expect(e.evaluate({ toolName: 'bash' }).action).toBe('block');
  });

  it('disabled policies do not match', () => {
    const e = new CriticalNodePolicyEngine();
    e.setPolicies([
      policy({
        matcher: { kind: 'tool', toolName: 'bash' },
        action: 'block',
        enabled: false,
      }),
    ]);
    expect(e.evaluate({ toolName: 'bash' }).action).toBe('log_only');
  });
});
