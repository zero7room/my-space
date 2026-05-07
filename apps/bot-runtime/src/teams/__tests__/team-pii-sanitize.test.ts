/**
 * Acceptance 65 — PII sanitization on TeamMessage.content / WorkItem.description /
 * WorkItem.resultRef text. Sanitizer redacts before persist; emit
 * `lastFailureReason_redacted` family event with `streamKind` label.
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
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'teams-pii-')),
    runtimeId: 'rt-pii',
  });
}

describe('Team PII sanitization (acceptance 65)', () => {
  it('redacts WorkItem.description and emits lastFailureReason_redacted{streamKind:team-events}', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 's' }],
    });
    const wi = await tr.publishWorkItem(
      threadId,
      parentTaskId,
      team.id,
      'email me at user@example.com about case',
    );
    expect(wi.description).not.toContain('user@example.com');
    expect(wi.description).toContain('<redacted:email>');
    const events = await rt.teams.readTeamEvents(threadId, parentTaskId, team.id);
    const redacted = events.find((e) => e.kind === 'lastFailureReason_redacted');
    expect(redacted).toBeDefined();
    expect((redacted!.payload as Record<string, unknown>).streamKind).toBe('team-events');
  });

  it('redacts TeamMessage.content and tags streamKind=messages', async () => {
    const rt = mkrt();
    const threadId = newThreadId();
    const parentTaskId = newTaskId();
    const tr = new TeamRuntime({ rt, now: () => NOW });
    const { team } = await tr.createTeam({
      threadId,
      parentTaskId,
      parentExecutorId: 'te_aaaaaaaaaaaaaaaaaaaaa',
      parentBudget: { maxDurationMs: 1_000_000, maxTokens: 1_000_000 },
      rosterSlots: [{ slotName: 's' }],
    });
    const m = await tr.postMessage(threadId, parentTaskId, team.id, {
      from: 'lead',
      to: 'broadcast',
      kind: 'chat',
      content: 'token: sk_live_AbCdEf0123456789ABCDEF',
    });
    expect(m.content).not.toContain('sk_live_AbCdEf0123456789ABCDEF');
    const events = await rt.teams.readTeamEvents(threadId, parentTaskId, team.id);
    const redacted = events.find(
      (e) =>
        e.kind === 'lastFailureReason_redacted' &&
        (e.payload as Record<string, unknown>).streamKind === 'messages',
    );
    expect(redacted).toBeDefined();
  });
});
