/**
 * Per-thread SSE event broadcaster + ring buffer.
 *
 * - `publish(event)` appends to the buffer and pushes to live subscribers.
 * - `subscribe({ since, signal })` returns an async iterable that first replays
 *   buffered events whose `seq > since`, then streams live events. When the
 *   subscriber's signal aborts, the iterator returns.
 * - Buffer is bounded by event count + max age. When an active team is present
 *   the count is doubled per env config.
 *
 * Cross-thread isolation: each thread has its own broadcaster instance owned by
 * the SseRegistry.
 */
import type { EventEnvelope } from '@ai-workflow/contracts';

export interface SseConfig {
  /** Default events kept in ring buffer per thread. */
  bufferEvents: number;
  /** Buffer cap when a team is active in the thread. */
  bufferEventsWithTeam: number;
  /** Max age in seconds. */
  maxAgeSec: number;
  /** ms after which a missing ack triggers replay. */
  ackTimeoutMs: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export const DEFAULT_SSE_CONFIG: SseConfig = {
  bufferEvents: 1000,
  bufferEventsWithTeam: 2000,
  maxAgeSec: 600,
  ackTimeoutMs: 30_000,
};

interface BufferEntry {
  event: EventEnvelope;
  ts: number;
}

interface Subscriber {
  push(entry: BufferEntry): void;
  close(): void;
}

export class ThreadEventBus {
  private readonly buffer: BufferEntry[] = [];
  private readonly subs = new Set<Subscriber>();
  private hasActiveTeam = false;

  constructor(private readonly cfg: SseConfig = DEFAULT_SSE_CONFIG) {}

  setActiveTeam(active: boolean): void {
    this.hasActiveTeam = active;
    this.evictByCap();
  }

  publish(event: EventEnvelope): void {
    const ts = (this.cfg.now ?? Date.now)();
    const entry: BufferEntry = { event, ts };
    this.buffer.push(entry);
    this.evictByCap();
    this.evictByAge();
    for (const s of this.subs) s.push(entry);
  }

  /**
   * Subscribe and replay events with `seq > sinceSeq`. If `sinceSeq` is below
   * the lowest in-buffer seq, returns the entire buffer.
   */
  async *subscribe({
    sinceSeq,
    signal,
  }: {
    sinceSeq?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<EventEnvelope> {
    const replay = this.buffer
      .filter((e) => sinceSeq === undefined || e.event.seq > sinceSeq)
      .map((e) => e.event);
    for (const ev of replay) {
      if (signal?.aborted) return;
      yield ev;
    }
    if (signal?.aborted) return;
    yield* this.live({ signal });
  }

  private async *live({
    signal,
  }: {
    signal?: AbortSignal;
  }): AsyncGenerator<EventEnvelope> {
    const queue: EventEnvelope[] = [];
    let resolveNext: ((v: void) => void) | null = null;
    let closed = false;
    const sub: Subscriber = {
      push: (entry) => {
        queue.push(entry.event);
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      },
      close: () => {
        closed = true;
        if (resolveNext) {
          const r = resolveNext;
          resolveNext = null;
          r();
        }
      },
    };
    this.subs.add(sub);
    const onAbort = () => sub.close();
    signal?.addEventListener('abort', onAbort);
    try {
      while (!closed && !signal?.aborted) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
    } finally {
      this.subs.delete(sub);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  bufferLength(): number {
    return this.buffer.length;
  }

  bufferTail(): EventEnvelope | undefined {
    return this.buffer[this.buffer.length - 1]?.event;
  }

  private cap(): number {
    return this.hasActiveTeam ? this.cfg.bufferEventsWithTeam : this.cfg.bufferEvents;
  }

  private evictByCap(): void {
    const cap = this.cap();
    while (this.buffer.length > cap) this.buffer.shift();
  }

  private evictByAge(): void {
    const now = (this.cfg.now ?? Date.now)();
    const minTs = now - this.cfg.maxAgeSec * 1000;
    while (this.buffer.length > 0 && this.buffer[0]!.ts < minTs) {
      this.buffer.shift();
    }
  }
}

export class SseRegistry {
  private readonly threads = new Map<string, ThreadEventBus>();
  constructor(private readonly cfg: SseConfig = DEFAULT_SSE_CONFIG) {}

  forThread(threadId: string): ThreadEventBus {
    let b = this.threads.get(threadId);
    if (!b) {
      b = new ThreadEventBus(this.cfg);
      this.threads.set(threadId, b);
    }
    return b;
  }

  publish(event: EventEnvelope): void {
    if (!event.threadId) return;
    this.forThread(event.threadId).publish(event);
  }
}
