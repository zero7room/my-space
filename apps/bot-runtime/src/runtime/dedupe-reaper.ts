/**
 * Periodic sweep of `state/webhooks/<provider>/<eventId>.json` and
 * `state/jobs/dedupe/<key>` records, removing anything older than
 * `WEBHOOK_DEDUPE_TTL_MS` (default 24h).
 *
 * Keeps the dedupe directory from unbounded growth while preserving
 * idempotency guarantees for the TTL window.
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';

import type { RuntimePaths } from './paths.js';

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface DedupeReaperOptions {
  rt: RuntimePaths;
  ttlMs?: number;
  intervalMs?: number;
  now?: () => number;
}

export class DedupeReaper {
  private timer?: NodeJS.Timeout;
  constructor(private readonly opts: DedupeReaperOptions) {}

  async sweep(): Promise<{ removed: number }> {
    const ttl = this.opts.ttlMs ?? DEFAULT_TTL_MS;
    const now = (this.opts.now ?? Date.now)();
    let removed = 0;
    removed += await reapDir(
      path.join(this.opts.rt.paths.stateRoot, 'webhooks'),
      now - ttl,
    );
    removed += await reapDir(
      this.opts.rt.paths.jobsBucketRoot('dedupe'),
      now - ttl,
    );
    return { removed };
  }

  start(): void {
    const interval = this.opts.intervalMs ?? 60 * 60 * 1000; // 1h
    this.timer = setInterval(() => {
      this.sweep().catch(() => undefined);
    }, interval);
    (this.timer as unknown as { unref?: () => void }).unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
}

async function reapDir(root: string, cutoffMs: number): Promise<number> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
  let removed = 0;
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      removed += await reapDir(full, cutoffMs);
      continue;
    }
    try {
      const stat = await fs.stat(full);
      if (stat.mtimeMs < cutoffMs) {
        await fs.unlink(full);
        removed++;
      }
    } catch {
      /* best-effort */
    }
  }
  return removed;
}
