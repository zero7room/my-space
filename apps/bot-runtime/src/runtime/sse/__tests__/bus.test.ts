import { describe, it, expect } from 'vitest';

import { ThreadEventBus, SseRegistry } from '../index.js';
import { newEventId, type EventEnvelope } from '@ai-workflow/contracts';

function ev(seq: number, kind: string = 'task_started', threadId = 'th_a'): EventEnvelope {
  return {
    id: newEventId(),
    seq,
    kind: kind as EventEnvelope['kind'],
    threadId,
    payload: {},
    at: new Date(seq * 1000).toISOString(),
  };
}

describe('ThreadEventBus replay + live', () => {
  it('replays buffer for new subscriber, then streams live', async () => {
    const bus = new ThreadEventBus({
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 60,
      ackTimeoutMs: 5000,
    });
    bus.publish(ev(0));
    bus.publish(ev(1));

    const ac = new AbortController();
    const it = bus.subscribe({ signal: ac.signal });
    const seqs: number[] = [];
    // Publish more events after the consumer starts, on macrotask boundary.
    setTimeout(() => bus.publish(ev(2)), 10);
    setTimeout(() => bus.publish(ev(3)), 20);
    for await (const e of it) {
      seqs.push(e.seq);
      if (seqs.length >= 4) {
        ac.abort();
        break;
      }
    }
    expect(seqs).toEqual([0, 1, 2, 3]);
  });

  it('respects sinceSeq for replay', async () => {
    const bus = new ThreadEventBus({
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 60,
      ackTimeoutMs: 5000,
    });
    for (let i = 0; i < 5; i++) bus.publish(ev(i));
    const ac = new AbortController();
    const it = bus.subscribe({ sinceSeq: 2, signal: ac.signal });
    const seqs: number[] = [];
    const t = (async () => {
      for await (const e of it) {
        seqs.push(e.seq);
        if (seqs.length >= 2) {
          ac.abort();
          break;
        }
      }
    })();
    await t;
    expect(seqs).toEqual([3, 4]);
  });

  it('evicts by buffer cap', () => {
    const bus = new ThreadEventBus({
      bufferEvents: 3,
      bufferEventsWithTeam: 3,
      maxAgeSec: 60,
      ackTimeoutMs: 5000,
    });
    for (let i = 0; i < 5; i++) bus.publish(ev(i));
    expect(bus.bufferLength()).toBe(3);
    expect(bus.bufferTail()?.seq).toBe(4);
  });

  it('uses larger cap when team is active', () => {
    const bus = new ThreadEventBus({
      bufferEvents: 2,
      bufferEventsWithTeam: 4,
      maxAgeSec: 60,
      ackTimeoutMs: 5000,
    });
    bus.setActiveTeam(true);
    for (let i = 0; i < 5; i++) bus.publish(ev(i));
    expect(bus.bufferLength()).toBe(4);
  });

  it('evicts by max age', () => {
    let now = 0;
    const bus = new ThreadEventBus({
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 1,
      ackTimeoutMs: 5000,
      now: () => now,
    });
    bus.publish(ev(0));
    now += 5000;
    bus.publish(ev(1));
    expect(bus.bufferLength()).toBe(1);
    expect(bus.bufferTail()?.seq).toBe(1);
  });
});

describe('SseRegistry per-thread isolation', () => {
  it('routes events by threadId', async () => {
    const reg = new SseRegistry();
    reg.publish(ev(0, 'task_started', 'th_a'));
    reg.publish(ev(0, 'task_started', 'th_b'));
    expect(reg.forThread('th_a').bufferLength()).toBe(1);
    expect(reg.forThread('th_b').bufferLength()).toBe(1);
  });
});

describe('ThreadEventBus ack timeout tracking', () => {
  it('reports subscribers that fell behind past ackTimeoutMs', () => {
    let now = 0;
    const bus = new ThreadEventBus({
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 60,
      ackTimeoutMs: 1_000,
      now: () => now,
    });
    // Subscriber acks seq 0 at t=0, buffer advances to seq 5.
    bus.publish(ev(0));
    bus.noteAck('sub-A', 0);
    for (let i = 1; i <= 5; i++) bus.publish(ev(i));

    now = 500; // below timeout
    expect(bus.checkAckTimeouts()).toHaveLength(0);

    now = 2_000; // past timeout
    const missing = bus.checkAckTimeouts();
    expect(missing).toHaveLength(1);
    expect(missing[0]!.subscriberId).toBe('sub-A');
    expect(missing[0]!.lastAckedSeq).toBe(0);
    expect(missing[0]!.gap).toBe(5);
  });

  it('ignores subscribers that are caught up', () => {
    let now = 0;
    const bus = new ThreadEventBus({
      bufferEvents: 100,
      bufferEventsWithTeam: 200,
      maxAgeSec: 60,
      ackTimeoutMs: 1_000,
      now: () => now,
    });
    for (let i = 0; i <= 2; i++) bus.publish(ev(i));
    bus.noteAck('sub-B', 2);
    now = 10_000;
    expect(bus.checkAckTimeouts()).toHaveLength(0);
  });
});
