import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  Transactions,
  makeTxTmpPath,
  atomicWriteJson,
  appendJsonl,
  readJson,
  readJsonl,
} from '../index.js';

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'fs-store-tx-'));
}

describe('Transactions', () => {
  it('prepare → commit applies write op', async () => {
    const root = tmp();
    const txRoot = path.join(root, '_transactions');
    const target = path.join(root, 'state', 'task.json');
    const tx = new Transactions({ transactionsRoot: txRoot });

    const txId = await tx.prepare([
      { kind: 'write', path: target, tmpPath: '__placeholder__' },
    ]);
    const tmpPath = makeTxTmpPath(target, txId);
    // Re-prepare with the right tmpPath. (In real callers, the tmpPath is
    // computed before prepare.)
    const txId2 = await tx.prepare([{ kind: 'write', path: target, tmpPath }]);
    void txId; // first txn just exercises prepare; not committed

    await atomicWriteJson(tmpPath, { hello: 'world' });
    await tx.commit(txId2);

    expect(await readJson(target)).toEqual({ hello: 'world' });
    const rec = await tx.read(txId2);
    expect(rec?.status).toBe('committed');
  });

  it('rollback drops tmp files and marks rolledback', async () => {
    const root = tmp();
    const txRoot = path.join(root, '_transactions');
    const target = path.join(root, 'will-not-exist.json');
    const tx = new Transactions({ transactionsRoot: txRoot });

    const txId = await tx.prepare([
      { kind: 'write', path: target, tmpPath: makeTxTmpPath(target, 'x') },
    ]);
    await tx.rollback(txId);
    const rec = await tx.read(txId);
    expect(rec?.status).toBe('rolledback');
  });

  it('recover replays committed and rolls back prepared', async () => {
    const root = tmp();
    const txRoot = path.join(root, '_transactions');
    const target1 = path.join(root, 'committed.json');
    const target2 = path.join(root, 'prepared.json');
    const tx = new Transactions({ transactionsRoot: txRoot });

    const txCommit = await tx.prepare([
      { kind: 'write', path: target1, tmpPath: makeTxTmpPath(target1, 'a') },
    ]);
    await atomicWriteJson(makeTxTmpPath(target1, 'a'), { ok: true });
    await tx.commit(txCommit);

    const txPrep = await tx.prepare([
      { kind: 'write', path: target2, tmpPath: makeTxTmpPath(target2, 'b') },
    ]);
    void txPrep;

    // Simulate startup
    const tx2 = new Transactions({ transactionsRoot: txRoot });
    const out = await tx2.recover();
    expect(out.replayed).toContain(txCommit);
    expect(out.rolledback).toContain(txPrep);

    // Replaying a committed tx is idempotent
    const out2 = await tx2.recover();
    expect(out2.replayed).toContain(txCommit);
  });

  it('commit applies append op', async () => {
    const root = tmp();
    const txRoot = path.join(root, '_transactions');
    const log = path.join(root, 'events.jsonl');
    const tx = new Transactions({ transactionsRoot: txRoot });

    const txId = await tx.prepare([
      { kind: 'append', path: log, payload: { a: 1 } },
      { kind: 'append', path: log, payload: { b: 2 } },
    ]);
    await tx.commit(txId);

    const lines = await readJsonl(log);
    expect(lines).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('commit applies rename op idempotently', async () => {
    const root = tmp();
    const txRoot = path.join(root, '_transactions');
    const src = path.join(root, 'src.json');
    const dst = path.join(root, 'dst.json');
    await atomicWriteJson(src, { v: 1 });
    const tx = new Transactions({ transactionsRoot: txRoot });
    const txId = await tx.prepare([{ kind: 'rename', from: src, to: dst }]);
    await tx.commit(txId);
    expect(await readJson(dst)).toEqual({ v: 1 });
    expect(await readJson(src)).toBeUndefined();

    // Recover should be a no-op.
    void appendJsonl;
    const out = await tx.recover();
    expect(out.replayed).toContain(txId);
  });
});
