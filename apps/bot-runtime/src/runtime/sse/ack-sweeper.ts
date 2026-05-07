/**
 * Periodic sweep that synthesizes `sse_ack_missing` and `sse_replay_emitted`
 * envelopes for subscribers whose ack is older than `ackTimeoutMs`. Called on
 * an interval by the server bootstrap; safe to call manually from tests.
 */
import { newEventId } from '@ai-workflow/contracts';

import type { SseRegistry } from './bus.js';

export interface AckSweeperOptions {
  sse: SseRegistry;
  intervalMs?: number;
  now?: () => string;
}

export class AckSweeper {
  private timer?: NodeJS.Timeout;
  constructor(private readonly opts: AckSweeperOptions) {}

  sweep(): number {
    const now = (this.opts.now ?? (() => new Date().toISOString()))();
    let emitted = 0;
    for (const [threadId, bus] of this.opts.sse.threadEntries()) {
      // Surface any buffer-eviction since the last sweep so clients know to
      // fall back to the full reload path (acceptance #41).
      const trunc = bus.drainTruncation();
      if (trunc) {
        bus.publish({
          id: newEventId(),
          seq: (bus.bufferTail()?.seq ?? 0) + 1,
          kind: 'sse_replay_truncated',
          threadId,
          payload: {
            reason: trunc.reason,
            droppedEventCount: trunc.droppedEventCount,
            oldestRetainedEventId: trunc.oldestRetainedEventId,
          },
          at: now,
        });
        emitted++;
      }
      for (const miss of bus.checkAckTimeouts()) {
        bus.publish({
          id: newEventId(),
          seq: (bus.bufferTail()?.seq ?? 0) + 1,
          kind: 'sse_ack_missing',
          threadId,
          payload: {
            subscriberId: miss.subscriberId,
            lastAckedSeq: miss.lastAckedSeq,
            gap: miss.gap,
          },
          at: now,
        });
        bus.publish({
          id: newEventId(),
          seq: (bus.bufferTail()?.seq ?? 0) + 1,
          kind: 'sse_replay_emitted',
          threadId,
          payload: {
            subscriberId: miss.subscriberId,
            fromSeq: miss.lastAckedSeq,
            reason: 'ack_missing',
          },
          at: now,
        });
        emitted += 2;
      }
    }
    return emitted;
  }

  start(): void {
    const interval = this.opts.intervalMs ?? 10_000;
    this.timer = setInterval(() => {
      try {
        this.sweep();
      } catch {
        /* swallow */
      }
    }, interval);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}
