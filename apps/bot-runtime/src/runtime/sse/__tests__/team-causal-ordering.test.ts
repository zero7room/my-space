/**
 * Acceptance 69 / 54 — bus detects causal-ordering violations for team events:
 *   - work_item_claimed before work_item_published
 *   - team_completed before any teammate terminal event
 * Violations are surfaced via drainInvariantViolation() and converted to
 * `sse_replay_invariant_violated` envelopes by the AckSweeper.
 */
import { describe, it, expect } from 'vitest';

import { newEventId, newTeamId, newWorkItemId, newThreadId } from '@ai-workflow/contracts';

import { ThreadEventBus, SseRegistry } from '../bus.js';
import { AckSweeper } from '../ack-sweeper.js';
import { RuntimeMetrics } from '../../../metrics/metrics.js';

const NOW = '2026-05-07T00:00:00.000Z';

describe('SSE team causal-ordering invariant (acceptance 69)', () => {
  it('detects work_item_claimed before work_item_published', () => {
    const bus = new ThreadEventBus();
    const threadId = newThreadId();
    const teamId = newTeamId();
    const workItemId = newWorkItemId();
    bus.publish({
      id: newEventId(),
      seq: 1,
      kind: 'work_item_claimed',
      threadId,
      teamId,
      payload: { workItemId, teammateId: 'tm_a' },
      at: NOW,
    });
    const v = bus.drainInvariantViolation();
    expect(v).toBeDefined();
    expect(v!.invariant).toBe('work_item_claimed_after_published');
  });

  it('does NOT flag work_item_claimed when work_item_published preceded', () => {
    const bus = new ThreadEventBus();
    const threadId = newThreadId();
    const teamId = newTeamId();
    const workItemId = newWorkItemId();
    bus.publish({
      id: newEventId(),
      seq: 1,
      kind: 'work_item_published',
      threadId,
      teamId,
      payload: { workItemId },
      at: NOW,
    });
    bus.publish({
      id: newEventId(),
      seq: 2,
      kind: 'work_item_claimed',
      threadId,
      teamId,
      payload: { workItemId, teammateId: 'tm_a' },
      at: NOW,
    });
    expect(bus.drainInvariantViolation()).toBeUndefined();
  });

  it('detects team_completed without any teammate terminal event', () => {
    const bus = new ThreadEventBus();
    const threadId = newThreadId();
    const teamId = newTeamId();
    bus.publish({
      id: newEventId(),
      seq: 1,
      kind: 'team_completed',
      threadId,
      teamId,
      payload: { outcome: 'completed' },
      at: NOW,
    });
    const v = bus.drainInvariantViolation();
    expect(v).toBeDefined();
    expect(v!.invariant).toBe('team_completed_after_teammate_terminals');
  });

  it('AckSweeper publishes sse_replay_invariant_violated and increments metric', () => {
    const reg = new SseRegistry();
    const metrics = new RuntimeMetrics();
    const sweeper = new AckSweeper({ sse: reg, metrics });
    const threadId = newThreadId();
    const teamId = newTeamId();
    const workItemId = newWorkItemId();
    const bus = reg.forThread(threadId);
    bus.publish({
      id: newEventId(),
      seq: 1,
      kind: 'work_item_claimed',
      threadId,
      teamId,
      payload: { workItemId },
      at: NOW,
    });
    sweeper.sweep();
    const tail = bus.bufferTail()!;
    expect(tail.kind).toBe('sse_replay_invariant_violated');
  });
});
