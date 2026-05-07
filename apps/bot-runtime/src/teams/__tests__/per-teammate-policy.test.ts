/**
 * Acceptance 64 — CriticalNodePolicy must be evaluated independently for each
 * teammate. Approval for teammate A must NOT bypass for teammate B.
 *
 * We assert that calling `evaluateTeammateToolCall` once per teammate
 * triggers a fresh `policyEngine.evaluate(...)` call (no memoization), and
 * that the slot persona is threaded into the request as skillName so
 * `scope: skill` policies can be persona-routed.
 */
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newThreadId,
  type CriticalNodePolicy,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { CriticalNodePolicyEngine } from '../../critical-node/policy-engine.js';
import { TeamRuntime, evaluateTeammateToolCall } from '../index.js';

const NOW = '2026-05-07T00:00:00.000Z';
function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'team-policy-')),
    runtimeId: 'rt-policy',
  });
}

describe('Per-teammate critical-node policy (acceptance 64)', () => {
  it('evaluate is called once per teammate; persona drives skill scope', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team, teammates } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [
        { slotName: 'researcher', persona: 'researcher' },
        { slotName: 'coder', persona: 'coder' },
      ],
    });
    expect(teammates.length).toBe(2);

    const engine = new CriticalNodePolicyEngine();
    // Persona-scoped policy: only matches when skillName === 'coder'.
    const personaPolicy: CriticalNodePolicy = {
      id: 'pol_persona_coder_appro_aaaaaa',
      scope: 'global',
      matcher: { kind: 'skill', skillName: 'coder' },
      action: 'require_approval',
      ownerUserId: 'usr_test_persona_aaaaaaaaaaaa',
      enabled: true,
      createdAt: NOW,
    };
    engine.setPolicies([personaPolicy]);
    const evalSpy = vi.spyOn(engine, 'evaluate');

    const r1 = await evaluateTeammateToolCall({
      rt,
      policyEngine: engine,
      threadId,
      taskId: parentTaskId,
      team,
      teammate: teammates[0]!,
      call: { toolName: 'bash' },
    });
    const r2 = await evaluateTeammateToolCall({
      rt,
      policyEngine: engine,
      threadId,
      taskId: parentTaskId,
      team,
      teammate: teammates[1]!,
      call: { toolName: 'bash' },
    });
    // researcher persona → no match (action stays log_only or no-match).
    expect(r1.decision.action).toBe('log_only');
    expect(r1.proceed).toBe(true);
    // coder persona → require_approval matches.
    expect(r2.decision.action).toBe('require_approval');
    expect(r2.proceed).toBe(false);

    // Spy must show fresh evaluations per teammate, no cache.
    expect(evalSpy).toHaveBeenCalledTimes(2);

    // Even after r2 was approved, calling again for teammate B re-evaluates.
    await evaluateTeammateToolCall({
      rt,
      policyEngine: engine,
      threadId,
      taskId: parentTaskId,
      team,
      teammate: teammates[1]!,
      call: { toolName: 'bash' },
    });
    expect(evalSpy).toHaveBeenCalledTimes(3);
  });
});
