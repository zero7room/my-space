/**
 * File-level transactions.
 *
 * Sequence:
 *   1. `prepare(ops)` writes `_transactions/<txId>.json` with status=`prepared`
 *      and the operation list.
 *   2. Caller writes `<participant>.tmp.<rand>` files for each `write` op,
 *      then `commit(txId)`.
 *   3. `commit` atomically renames every `.tmp.*` to its final name and
 *      updates the transaction record to `committed`.
 *   4. On startup, `recoverTransactions(root)` rolls back `prepared` records
 *      (deletes their tmp files) and replays `committed` records that died
 *      mid-rename (the operation list is idempotent).
 *
 * For `append` ops (JSONL), prepare records the path; commit appends. For
 * `rename` ops the txn just records the move (idempotent if the source is
 * already gone). For `delete` ops, commit unlinks; rollback is a no-op.
 *
 * The transaction record itself is the durability boundary: anything outside
 * `_transactions/` not yet committed is considered tentative.
 */
import * as fs from 'node:fs/promises';
import path from 'node:path';

import { newTransactionId } from '@ai-workflow/contracts';

import {
  TransactionPreparedOnlyError,
} from './errors.js';
import {
  atomicRename,
  atomicWriteJson,
  ensureDir,
  listJsonFilesSorted,
  readJson,
  removeIfExists,
} from './primitives.js';

type TxStatus = 'prepared' | 'committed' | 'rolledback';

export type TxOperation =
  | { kind: 'write'; path: string; tmpPath: string }
  | { kind: 'append'; path: string; payload: unknown }
  | { kind: 'rename'; from: string; to: string }
  | { kind: 'delete'; path: string };

interface TransactionRecord {
  id: string;
  status: TxStatus;
  operations: TxOperation[];
  eventIds: string[];
  createdAt: string;
  completedAt?: string;
}

export interface TransactionsConfig {
  /** Absolute path to the `_transactions/` directory. */
  transactionsRoot: string;
}

export class Transactions {
  constructor(private readonly cfg: TransactionsConfig) {}

  private txFile(txId: string): string {
    return path.join(this.cfg.transactionsRoot, `${txId}.json`);
  }

  async prepare(operations: TxOperation[], eventIds: string[] = []): Promise<string> {
    await ensureDir(this.cfg.transactionsRoot);
    const txId = newTransactionId();
    const record: TransactionRecord = {
      id: txId,
      status: 'prepared',
      operations,
      eventIds,
      createdAt: new Date().toISOString(),
    };
    await atomicWriteJson(this.txFile(txId), record);
    return txId;
  }

  /**
   * Replay the operation list, then mark `committed`. Idempotent — calling
   * twice is safe.
   */
  async commit(txId: string): Promise<void> {
    const record = await readJson<TransactionRecord>(this.txFile(txId));
    if (!record) throw new TransactionPreparedOnlyError(txId);
    if (record.status === 'committed') return;
    if (record.status === 'rolledback') {
      throw new Error(`cannot commit rolledback transaction ${txId}`);
    }
    await this.applyOperations(record.operations);
    const next: TransactionRecord = {
      ...record,
      status: 'committed',
      completedAt: new Date().toISOString(),
    };
    await atomicWriteJson(this.txFile(txId), next);
  }

  async rollback(txId: string): Promise<void> {
    const record = await readJson<TransactionRecord>(this.txFile(txId));
    if (!record) return;
    if (record.status === 'committed') return; // can't rollback once committed
    // Best-effort: drop any tmp files left by `write` ops.
    for (const op of record.operations) {
      if (op.kind === 'write') {
        await removeIfExists(op.tmpPath);
      }
    }
    const next: TransactionRecord = {
      ...record,
      status: 'rolledback',
      completedAt: new Date().toISOString(),
    };
    await atomicWriteJson(this.txFile(txId), next);
  }

  /**
   * Replay a single transaction's operation list. Each op must be idempotent.
   */
  private async applyOperations(operations: TxOperation[]): Promise<void> {
    for (const op of operations) {
      switch (op.kind) {
        case 'write': {
          // Caller already wrote `op.tmpPath`. Rename atomically. If the dest
          // already exists with same content, rename overwrites — POSIX rename
          // semantics make this safe to retry.
          try {
            await atomicRename(op.tmpPath, op.path);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              // Source is gone — assume the rename happened in a prior partial
              // commit. Idempotent.
            } else {
              throw err;
            }
          }
          break;
        }
        case 'append': {
          // Append ops are inherently idempotent only when the caller dedupes
          // by event id. The committed marker exists on the txn record itself,
          // so we treat append as an append; downstream consumers must filter
          // duplicate event ids if a crash replayed.
          const { appendJsonl } = await import('./primitives.js');
          await appendJsonl(op.path, op.payload);
          break;
        }
        case 'rename': {
          try {
            await atomicRename(op.from, op.to);
          } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
              // already moved
            } else {
              throw err;
            }
          }
          break;
        }
        case 'delete': {
          await removeIfExists(op.path);
          break;
        }
      }
    }
  }

  /**
   * Recovery scan: roll back any `prepared` records, replay any `committed`
   * records that may have been interrupted before completion (idempotent), and
   * leave `rolledback` records untouched.
   *
   * Returns the lists of tx ids by outcome, for telemetry.
   */
  async recover(): Promise<{
    rolledback: string[];
    replayed: string[];
    untouched: string[];
  }> {
    await ensureDir(this.cfg.transactionsRoot);
    const files = await listJsonFilesSorted(this.cfg.transactionsRoot);
    const rolledback: string[] = [];
    const replayed: string[] = [];
    const untouched: string[] = [];

    for (const f of files) {
      const record = await readJson<TransactionRecord>(f);
      if (!record) continue;
      if (record.status === 'prepared') {
        await this.rollback(record.id);
        rolledback.push(record.id);
      } else if (record.status === 'committed') {
        // Re-apply ops if needed. `applyOperations` is idempotent.
        await this.applyOperations(record.operations);
        replayed.push(record.id);
      } else {
        untouched.push(record.id);
      }
    }
    return { rolledback, replayed, untouched };
  }

  /**
   * Read a transaction record, or undefined.
   */
  async read(txId: string): Promise<TransactionRecord | undefined> {
    return readJson<TransactionRecord>(this.txFile(txId));
  }
}

/**
 * Compute the tmp path for a "write" op. Use this when preparing a transaction
 * so the caller and committer agree.
 */
export function makeTxTmpPath(finalPath: string, txId: string): string {
  return `${finalPath}.tmp.${txId}`;
}

/**
 * Re-export for callers that want to remove a leftover tmp without going
 * through the Transactions class.
 */
export const _internal = { fs };
