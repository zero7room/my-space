/**
 * Notify throttling: prevent the runtime from spamming the same channel
 * conversation. Token-bucket per (provider, externalConversationId).
 *
 * Default: 5 messages per 60 s window. When the bucket is empty, the runtime
 * emits `channel_notify_throttled` and drops the outbound (caller decides
 * whether to retry).
 */

export interface ThrottleConfig {
  capacity: number;
  refillPerSec: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  capacity: 5,
  refillPerSec: 5 / 60,
};

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export class NotifyThrottle {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly cfg: ThrottleConfig = DEFAULT_THROTTLE) {}

  consume(provider: string, externalId: string): boolean {
    const key = `${provider}:${externalId}`;
    const t = (this.cfg.now ?? Date.now)();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.cfg.capacity, lastRefillAt: t };
      this.buckets.set(key, b);
    }
    const elapsed = Math.max(0, (t - b.lastRefillAt) / 1000);
    b.tokens = Math.min(this.cfg.capacity, b.tokens + elapsed * this.cfg.refillPerSec);
    b.lastRefillAt = t;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }
}
