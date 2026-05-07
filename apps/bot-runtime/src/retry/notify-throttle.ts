/**
 * Notify throttling. Token-bucket keyed by a composite (provider | target |
 * taskId | notificationKind) plus a global per-provider RPM ceiling.
 *
 * Defaults match requirement §10.1 #43:
 *   - per (taskId, provider, target, notificationKind): 1 call / 15 min
 *   - global per provider: 30 / min
 *
 * When a caller doesn't have a taskId or kind, the key degrades to
 * (provider, externalId) semantics — useful for outbound jobs that aren't
 * task-scoped.
 */

export interface ThrottleConfig {
  /** Per-key bucket capacity. */
  capacity: number;
  /** Per-key refill rate (tokens/sec). */
  refillPerSec: number;
  /** Optional global per-provider RPM cap. 0 / undefined disables. */
  globalPerProviderRpm?: number;
  now?: () => number;
}

export const DEFAULT_THROTTLE: ThrottleConfig = {
  capacity: 1,
  refillPerSec: 1 / (15 * 60),
  globalPerProviderRpm: 30,
};

export interface NotifyKeyParts {
  provider: string;
  externalId: string;
  taskId?: string;
  notificationKind?: string;
}

export function notifyKey(parts: NotifyKeyParts): string {
  return [
    parts.provider,
    parts.externalId,
    parts.taskId ?? '-',
    parts.notificationKind ?? '-',
  ].join('|');
}

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

export class NotifyThrottle {
  private readonly buckets = new Map<string, Bucket>();
  private readonly globalBuckets = new Map<string, Bucket>();
  constructor(private readonly cfg: ThrottleConfig = DEFAULT_THROTTLE) {}

  /**
   * `consume` accepts either structured parts (preferred) or a legacy
   * "provider:externalId" string. Returns true iff a token was taken.
   */
  consume(input: NotifyKeyParts | string, legacyExternalId?: string): boolean {
    const parts: NotifyKeyParts =
      typeof input === 'string'
        ? legacyExternalId !== undefined
          ? { provider: input, externalId: legacyExternalId }
          : parseLegacy(input)
        : input;
    const provider = parts.provider;
    const now = (this.cfg.now ?? Date.now)();

    if (this.cfg.globalPerProviderRpm && this.cfg.globalPerProviderRpm > 0) {
      const cap = this.cfg.globalPerProviderRpm;
      const g = this.globalBuckets.get(provider) ?? {
        tokens: cap,
        lastRefillAt: now,
      };
      const elapsedMin = Math.max(0, (now - g.lastRefillAt) / 60_000);
      g.tokens = Math.min(cap, g.tokens + elapsedMin * cap);
      g.lastRefillAt = now;
      if (g.tokens < 1) {
        this.globalBuckets.set(provider, g);
        return false;
      }
      g.tokens -= 1;
      this.globalBuckets.set(provider, g);
    }

    const key = notifyKey(parts);
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.cfg.capacity, lastRefillAt: now };
      this.buckets.set(key, b);
    }
    const elapsed = Math.max(0, (now - b.lastRefillAt) / 1000);
    b.tokens = Math.min(
      this.cfg.capacity,
      b.tokens + elapsed * this.cfg.refillPerSec,
    );
    b.lastRefillAt = now;
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /**
   * Reset the per-key bucket — called when a user manually retries so their
   * decision isn't suppressed by a stale throttle window (per #43).
   */
  reset(parts: NotifyKeyParts): void {
    this.buckets.delete(notifyKey(parts));
  }
}

function parseLegacy(k: string): NotifyKeyParts {
  const [provider = '', externalId = ''] = k.split(':');
  return { provider, externalId };
}
