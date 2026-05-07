/**
 * Cross-process advisory locks and lease primitives.
 *
 * Two flavors:
 *   - `acquireInstanceLock` writes a `.lock` file with `{runtimeId, pid,
 *     acquiredAt, leaseExpireAt, fencingToken}` using `O_CREAT|O_EXCL`. If the
 *     file exists, we read it and check if the holder is dead (heartbeat older
 *     than lease) — if so we *rename* it to `.lock.stale.<oldFencingToken>`
 *     and try again. Never unlinked, so stale locks remain auditable.
 *   - `Lease` is a typed handle managed by `LeaseManager`, kept in memory.
 *     Persistent leases (e.g. work-item claim leases) are stored as fields on
 *     the relevant record and validated at read time using `now`.
 */
import { closeSync, constants, openSync, readFileSync, renameSync, writeFileSync, fsyncSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { LockNotAcquiredError } from './errors.js';
import { ensureDir } from './primitives.js';

export interface InstanceLockHolder {
  runtimeId: string;
  pid: number;
  acquiredAt: string;
  leaseExpireAt: string;
  fencingToken: number;
  serverId?: string;
}

export interface AcquireInstanceLockOptions {
  lockPath: string;
  runtimeId: string;
  serverId?: string;
  /** Lease length in ms. Default 60 s. */
  leaseMs?: number;
  /** Override pid for tests. */
  pid?: number;
  /** Optional clock injection for tests. */
  now?: () => number;
}

const DEFAULT_LEASE_MS = 60_000;

/**
 * Acquire the per-instance lock. If a stale lock (lease expired) is present,
 * rename it to `*.stale.<oldFencingToken>` and retry.
 */
export async function acquireInstanceLock(
  opts: AcquireInstanceLockOptions,
): Promise<InstanceLockHolder> {
  const now = opts.now ?? Date.now;
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const pid = opts.pid ?? process.pid;
  await ensureDir(path.dirname(opts.lockPath));

  for (let attempt = 0; attempt < 3; attempt++) {
    const fencingToken = Math.floor(now());
    const holder: InstanceLockHolder = {
      runtimeId: opts.runtimeId,
      pid,
      acquiredAt: new Date(now()).toISOString(),
      leaseExpireAt: new Date(now() + leaseMs).toISOString(),
      fencingToken,
      serverId: opts.serverId,
    };
    try {
      const fd = openSync(
        opts.lockPath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL,
        0o644,
      );
      try {
        writeFileSync(fd, JSON.stringify(holder));
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      return holder;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }

    // Lock exists. Check if it's stale.
    const existing = await readInstanceLock(opts.lockPath);
    if (!existing) {
      // racy — let the loop retry
      continue;
    }
    const expireMs = Date.parse(existing.leaseExpireAt);
    if (Number.isFinite(expireMs) && expireMs < now()) {
      // Stale — preserve evidence and try again.
      const stalePath = `${opts.lockPath}.stale.${existing.fencingToken}`;
      try {
        renameSync(opts.lockPath, stalePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
      continue;
    }

    throw new LockNotAcquiredError(opts.lockPath, existing);
  }
  throw new LockNotAcquiredError(opts.lockPath, undefined);
}

export async function releaseInstanceLock(lockPath: string): Promise<void> {
  try {
    await fs.unlink(lockPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

export async function readInstanceLock(
  lockPath: string,
): Promise<InstanceLockHolder | undefined> {
  try {
    const buf = readFileSync(lockPath);
    return JSON.parse(buf.toString('utf8')) as InstanceLockHolder;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    return undefined;
  }
}

/**
 * Refresh the lease on an instance lock (heartbeat). Caller must already hold.
 */
export async function refreshInstanceLock(
  lockPath: string,
  leaseMs = DEFAULT_LEASE_MS,
  now: () => number = Date.now,
): Promise<void> {
  const existing = await readInstanceLock(lockPath);
  if (!existing) throw new LockNotAcquiredError(lockPath, undefined);
  existing.leaseExpireAt = new Date(now() + leaseMs).toISOString();
  // Atomically replace via tmp+rename to avoid torn read.
  const tmp = `${lockPath}.tmp.${existing.fencingToken}`;
  const fd = openSync(tmp, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC, 0o644);
  try {
    writeFileSync(fd, JSON.stringify(existing));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, lockPath);
}

// --------- Generic lease tracker -----------------------------------------

export interface LeaseHandle {
  id: string;
  resource: string;
  holderId: string;
  fencingToken: number;
  expireAt: number;
}

/**
 * In-memory lease tracker. Used by callers that don't need cross-process
 * lease durability (e.g. transient executor leases). Cross-process leases
 * (work-item claim, retry-scheduler) live as fields on durable records.
 */
export class LeaseManager {
  private readonly leases = new Map<string, LeaseHandle>();
  private nextToken = 1;
  constructor(private readonly now: () => number = Date.now) {}

  acquire(
    resource: string,
    holderId: string,
    leaseMs: number,
  ): LeaseHandle | undefined {
    const existing = this.leases.get(resource);
    const t = this.now();
    if (existing && existing.expireAt > t && existing.holderId !== holderId) {
      return undefined;
    }
    const handle: LeaseHandle = {
      id: `lease_${this.nextToken++}`,
      resource,
      holderId,
      fencingToken: this.nextToken,
      expireAt: t + leaseMs,
    };
    this.leases.set(resource, handle);
    return handle;
  }

  refresh(handle: LeaseHandle, leaseMs: number): boolean {
    const cur = this.leases.get(handle.resource);
    if (!cur || cur.id !== handle.id) return false;
    cur.expireAt = this.now() + leaseMs;
    return true;
  }

  release(handle: LeaseHandle): void {
    const cur = this.leases.get(handle.resource);
    if (cur && cur.id === handle.id) this.leases.delete(handle.resource);
  }

  /** Drop all leases whose expireAt is in the past. Returns the dropped count. */
  expireStale(): number {
    const t = this.now();
    let n = 0;
    for (const [k, v] of this.leases) {
      if (v.expireAt <= t) {
        this.leases.delete(k);
        n++;
      }
    }
    return n;
  }
}
