/**
 * Periodic sweep that synthesizes `sse_ack_missing` and `sse_replay_emitted`
 * envelopes for subscribers whose ack is older than `ackTimeoutMs`. Called on
 * an interval by the server bootstrap; safe to call manually from tests.
 */
import { newEventId } from '@ai-workflow/contracts';

import type { SseRegistry } from './bus.js';
import type { RuntimeMetrics } from '../../metrics/metrics.js';

export interface AckSweeperOptions {
  sse: SseRegistry;
  intervalMs?: number;
  metrics?: RuntimeMetrics;
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
        try { this.opts.metrics?.sseReplayTruncated.inc({ reason: trunc.reason }); } catch { /* best-effort */ }
        emitted++;
      }
      // Acceptance 69 / 54 — surface invariant violations as their own envelope.
      const inv = bus.drainInvariantViolation();
      if (inv) {
        bus.publish({
          id: newEventId(),
          seq: (bus.bufferTail()?.seq ?? 0) + 1,
          kind: 'sse_replay_invariant_violated',
          threadId,
          payload: {
            invariant: inv.invariant,
            eventId: inv.eventId,
            ...inv.details,
          },
          at: now,
        });
        try { this.opts.metrics?.sseReplayInvariantViolated.inc({ invariant: inv.invariant }); } catch { /* best-effort */ }
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
        try {
          this.opts.metrics?.sseAckMissing.inc({ threadId });
          this.opts.metrics?.sseReplayEmitted.inc({ reason: 'ack_missing' });
        } catch { /* best-effort */ }
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
