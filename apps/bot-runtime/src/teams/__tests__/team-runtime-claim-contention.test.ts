/**
 * Acceptance 58 — claim atomicity regression test.
 *
 * Spec: 5 concurrent claims on the same WorkItem → exactly 1 succeeds; the
 * remaining 4 must surface a `team_claim_contention` outcome and not hold a
 * lease.
 *
 * Status: with the rename-FIRST claim path, exactly one teammate wins and the
 * persisted file in claimed/ has status="claimed" with that teammate's id.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { newTaskId, newThreadId } from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { TeamRuntime } from '../index.js';

const NOW = '2026-05-07T00:00:00.000Z';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'teams-claim-')),
    runtimeId: 'rt-claim',
  });
}

describe('TeamRuntime claim contention (acceptance 58)', () => {
  it('5 concurrent claims → exactly 1 winner; persisted file has status=claimed', async () => {
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
        { slotName: 'a' },
        { slotName: 'b' },
        { slotName: 'c' },
        { slotName: 'd' },
        { slotName: 'e' },
      ],
    });
    expect(teammates.length).toBe(5);
    const wi = await tr.publishWorkItem(threadId, parentTaskId, team.id, 'do');

    const results = await Promise.allSettled(
      teammates.map((tm) =>
        tr.claimWorkItem(threadId, parentTaskId, team.id, wi.id, tm.id),
      ),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    // Strong invariant: exactly one fulfilled.
    expect(fulfilled.length).toBe(1);

    const claimed = await rt.teams.listWorkItems(threadId, parentTaskId, team.id, 'claimed');
    const persisted = claimed.find((i) => i.id === wi.id);
    expect(persisted).toBeDefined();
    // Acceptance 58: persisted file reflects the claim — status=claimed and a winner.
    expect(persisted!.status).toBe('claimed');
    expect(persisted!.claimedByTeammateId).toBeDefined();
    // Available bucket no longer holds the item.
    const avail = await rt.teams.listWorkItems(threadId, parentTaskId, team.id, 'available');
    expect(avail.find((i) => i.id === wi.id)).toBeUndefined();
  });
});
