import type { EventEnvelope } from '@ai-workflow/contracts';
import { API_ROUTES } from '@ai-workflow/contracts';
import { bearerToken, runtimeUrl } from './env';
import { useSseStore } from './stores/sse';

export type SseClientOptions = {
  threadId: string;
  sinceSeq?: number;
  ackIntervalMs?: number;
  onEvent?: (e: EventEnvelope) => void;
  onError?: (err: unknown) => void;
};

const DEFAULT_ACK_MS = 10_000;

export class ThreadSseClient {
  private readonly opts: SseClientOptions;
  private abort = new AbortController();
  private ackTimer: ReturnType<typeof setInterval> | null = null;
  private lastSeenSeq: number | null = null;

  constructor(opts: SseClientOptions) {
    this.opts = opts;
  }

  start(): void {
    void this.run();
    this.ackTimer = setInterval(
      () => this.sendAck(),
      this.opts.ackIntervalMs ?? DEFAULT_ACK_MS,
    );
  }

  close(): void {
    this.abort.abort();
    if (this.ackTimer) clearInterval(this.ackTimer);
    this.ackTimer = null;
  }

  private async run(): Promise<void> {
    const { threadId, sinceSeq, onEvent, onError } = this.opts;
    const url = new URL(`${runtimeUrl()}${API_ROUTES.threads.events(threadId)}`);
    if (sinceSeq !== undefined) url.searchParams.set('since', String(sinceSeq));
    try {
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${bearerToken()}` },
        signal: this.abort.signal,
      });
      if (!res.ok || !res.body) throw new Error(`sse ${res.status}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLine = frame.split('\n').find((l) => l.startsWith('data: '));
          if (!dataLine) continue;
          const json = dataLine.slice('data: '.length);
          try {
            const ev = JSON.parse(json) as EventEnvelope;
            this.dispatch(ev);
            if (onEvent) onEvent(ev);
          } catch {
            /* ignore malformed */
          }
        }
      }
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') return;
      if (onError) onError(err);
    }
  }

  private dispatch(ev: EventEnvelope): void {
    const sse = useSseStore.getState();
    if (typeof ev.seq === 'number') {
      this.lastSeenSeq = ev.seq;
      sse.setLastEventId(ev.seq);
      // end of replay window — exit degraded
      if (
        sse.replaying &&
        sse.replayTo !== null &&
        ev.seq >= sse.replayTo
      ) {
        sse.setReplay(null, null);
        sse.setDegraded(false);
      }
    }
    switch (ev.kind) {
      case 'sse_ack_missing':
        sse.setDegraded(true);
        break;
      case 'sse_replay_emitted': {
        const p = ev.payload as { fromEventId?: number; toEventId?: number } | undefined;
        sse.setReplay(p?.fromEventId ?? null, p?.toEventId ?? null);
        break;
      }
      case 'sse_replay_truncated':
        sse.setReloadRequired(true);
        break;
      default:
        break;
    }
  }

  private async sendAck(): Promise<void> {
    if (this.lastSeenSeq === null) return;
    const { threadId } = this.opts;
    try {
      await fetch(`${runtimeUrl()}${API_ROUTES.threads.ack(threadId)}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${bearerToken()}`,
        },
        body: JSON.stringify({
          cursor: this.lastSeenSeq,
          ackedAt: new Date().toISOString(),
        }),
      });
    } catch {
      /* ack is best-effort */
    }
  }
}
