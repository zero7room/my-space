/**
 * Acceptance #12 regression — CriticalNodePolicy hot reload.
 *
 * After CRUD on `/api/critical-node-policies` the engine wired into the server
 * must reflect the new policy on the next `evaluate(...)` call without any
 * runtime restart.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newPolicyId,
  newUserId,
  type CriticalNodePolicy,
} from '@ai-workflow/contracts';

import { createServer } from '../../api/server.js';

describe('Acceptance #12 — policy hot reload via API', () => {
  it('engine.evaluate sees a new external_io policy after POST without restart', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'p2-policy-reload-'));
    const owner = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: 'rt-policy-reload',
      localUserTokens: `${owner}:tok-x`,
      skipLock: true,
    });
    try {
      await handle.rt.users.upsert({
        id: owner,
        displayName: 'Owner',
        channelIdentities: {},
        createdAt: '2026-05-07T00:00:00.000Z',
        updatedAt: '2026-05-07T00:00:00.000Z',
      });
      // Baseline: no external_io policy → evaluate returns log_only.
      let dec = handle.policyEngine.evaluate({
        toolName: 'notify_bound_channel',
        externalIo: { direction: 'outbound', provider: 'feishu' },
      });
      expect(dec.action).toBe('log_only');

      const policy: CriticalNodePolicy = {
        id: newPolicyId(),
        scope: 'global',
        matcher: { kind: 'external_io', direction: 'outbound' },
        action: 'require_approval',
        ownerUserId: owner,
        enabled: true,
        createdAt: '2026-05-07T00:00:00.000Z',
      };
      const res = await handle.app.inject({
        method: 'POST',
        url: '/api/critical-node-policies',
        headers: { authorization: 'Bearer tok-x' },
        payload: {
          scope: policy.scope,
          matcher: policy.matcher,
          action: policy.action,
          enabled: policy.enabled,
          ownerUserId: owner,
        },
      });
      expect(res.statusCode).toBe(200);

      // Engine must now evaluate as require_approval — hot reloaded.
      dec = handle.policyEngine.evaluate({
        toolName: 'notify_bound_channel',
        externalIo: { direction: 'outbound', provider: 'feishu' },
      });
      expect(dec.action).toBe('require_approval');
    } finally {
      await handle.close();
    }
  });
});
