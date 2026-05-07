/**
 * Acceptance #41 regression: when the ring buffer evicts entries (cap or age),
 * the next AckSweeper run must publish an `sse_replay_truncated` envelope so
 * clients drop into the full-reload fallback path.
 */
import { describe, it, expect } from 'vitest';

import { newEventId, type EventEnvelope } from '@ai-workflow/contracts';

import { AckSweeper, SseRegistry, ThreadEventBus } from '../index.js';

function ev(seq: number, threadId = 'th_a'): EventEnvelope {
  return {
    id: newEventId(),
    seq,
    kind: 'task_started',
    threadId,
    payload: {},
    at: new Date(seq * 1000).toISOString(),
  };
}

describe('SSE replay truncation', () => {
  it('publishes sse_replay_truncated when the ring buffer overflows', () => {
    const cfg = {
      bufferEvents: 2,
      bufferEventsWithTeam: 2,
      maxAgeSec: 60,
      ackTimeoutMs: 1_000,
    };
    const reg = new SseRegistry(cfg);
    const bus: ThreadEventBus = reg.forThread('th_a');
    for (let i = 0; i < 5; i++) bus.publish(ev(i));
    const sweeper = new AckSweeper({ sse: reg, now: () => '2026-05-07T00:00:00.000Z' });
    sweeper.sweep();
    const tail = bus.bufferTail();
    expect(tail?.kind).toBe('sse_replay_truncated');
    const payload = tail!.payload as Record<string, unknown>;
    expect(payload['reason']).toBe('buffer_overflow');
    expect((payload['droppedEventCount'] as number) ?? 0).toBeGreaterThan(0);
  });

  it('publishes sse_replay_truncated when the buffer ages out', () => {
    let now = 0;
    const cfg = {
      bufferEvents: 100,
      bufferEventsWithTeam: 100,
      maxAgeSec: 1,
      ackTimeoutMs: 1_000,
      now: () => now,
    };
    const reg = new SseRegistry(cfg);
    const bus = reg.forThread('th_b');
    bus.publish(ev(0, 'th_b'));
    now = 5_000;
    bus.publish(ev(1, 'th_b'));
    const sweeper = new AckSweeper({ sse: reg, now: () => '2026-05-07T00:00:00.000Z' });
    sweeper.sweep();
    const events = (bus as ThreadEventBus & { bufferTail(): EventEnvelope | undefined })
      .bufferTail();
    expect(events?.kind).toBe('sse_replay_truncated');
    expect(((events!.payload as Record<string, unknown>)['reason'] as string)).toBe('max_age_reached');
  });

  it('does not publish sse_replay_truncated when no eviction occurred', () => {
    const cfg = {
      bufferEvents: 100,
      bufferEventsWithTeam: 100,
      maxAgeSec: 60,
      ackTimeoutMs: 1_000,
    };
    const reg = new SseRegistry(cfg);
    const bus = reg.forThread('th_c');
    for (let i = 0; i < 5; i++) bus.publish(ev(i, 'th_c'));
    const sweeper = new AckSweeper({ sse: reg });
    expect(sweeper.sweep()).toBe(0);
    expect(bus.bufferTail()?.kind).toBe('task_started');
  });
});
