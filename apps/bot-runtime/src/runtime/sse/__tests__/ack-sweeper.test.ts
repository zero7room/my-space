import { describe, it, expect } from 'vitest';

import {
  AckSweeper,
  SseRegistry,
  ThreadEventBus,
} from '../index.js';
import { type EventEnvelope, newEventId } from '@ai-workflow/contracts';

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

describe('AckSweeper', () => {
  it('synthesizes sse_ack_missing + sse_replay_emitted for stalled subscribers', () => {
    let now = 0;
    const cfg = {
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 60,
      ackTimeoutMs: 1_000,
      now: () => now,
    };
    const reg = new SseRegistry(cfg);
    const bus: ThreadEventBus = reg.forThread('th_a');
    bus.publish(ev(0));
    bus.noteAck('sub-X', 0);
    for (let i = 1; i <= 5; i++) bus.publish(ev(i));
    now = 2_000;
    const sweeper = new AckSweeper({ sse: reg, now: () => '2026-05-07T00:00:00.000Z' });
    const count = sweeper.sweep();
    expect(count).toBeGreaterThanOrEqual(2);
    const out = (bus as ThreadEventBus & { bufferTail(): EventEnvelope | undefined })
      .bufferTail();
    expect(out?.kind).toBe('sse_replay_emitted');
  });

  it('no synthesis when everyone acked up to the tail', () => {
    let now = 0;
    const cfg = {
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 60,
      ackTimeoutMs: 1_000,
      now: () => now,
    };
    const reg = new SseRegistry(cfg);
    const bus = reg.forThread('th_a');
    for (let i = 0; i < 3; i++) bus.publish(ev(i));
    bus.noteAck('sub-Y', 2);
    now = 10_000;
    const sweeper = new AckSweeper({ sse: reg });
    expect(sweeper.sweep()).toBe(0);
  });
});
