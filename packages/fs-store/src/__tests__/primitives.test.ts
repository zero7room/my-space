import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  atomicWriteJson,
  readJson,
  appendJsonl,
  readJsonl,
  exclusiveCreateJson,
  ExclusiveCreateConflictError,
  cleanupTmpOrphans,
  listJsonFilesSorted,
  listSubdirsSorted,
  sha256File,
} from '../index.js';

function tmp(): string {
  return mkdtempSync(path.join(tmpdir(), 'fs-store-prim-'));
}

describe('atomicWriteJson + readJson', () => {
  it('round-trips and overwrites', async () => {
    const dir = tmp();
    const file = path.join(dir, 'a.json');
    await atomicWriteJson(file, { a: 1 });
    expect(await readJson(file)).toEqual({ a: 1 });
    await atomicWriteJson(file, { a: 2, b: 'x' });
    expect(await readJson(file)).toEqual({ a: 2, b: 'x' });
  });

  it('serialization is stable (deterministic key order)', async () => {
    const dir = tmp();
    const file = path.join(dir, 'b.json');
    await atomicWriteJson(file, { b: 1, a: 2 });
    const contents = readFileSync(file, 'utf8');
    expect(contents).toBe('{"a":2,"b":1}');
  });

  it('readJson returns undefined for missing files', async () => {
    expect(await readJson(path.join(tmp(), 'nope.json'))).toBeUndefined();
  });
});

describe('appendJsonl + readJsonl', () => {
  it('appends and reads', async () => {
    const dir = tmp();
    const log = path.join(dir, 'log.jsonl');
    await appendJsonl(log, { i: 1 });
    await appendJsonl(log, { i: 2 });
    const lines = await readJsonl<{ i: number }>(log);
    expect(lines.map((l) => l.i)).toEqual([1, 2]);
  });

  it('tolerates a trailing partial line', async () => {
    const dir = tmp();
    const log = path.join(dir, 'log.jsonl');
    await appendJsonl(log, { i: 1 });
    // Manually corrupt: write a bad partial line by appending raw bytes.
    const { writeFileSync } = await import('node:fs');
    writeFileSync(log, '{partial', { flag: 'a' });
    const lines = await readJsonl<{ i: number }>(log);
    expect(lines).toEqual([{ i: 1 }]);
  });
});

describe('exclusiveCreateJson', () => {
  it('throws on second create', async () => {
    const dir = tmp();
    const file = path.join(dir, 'claim.json');
    await exclusiveCreateJson(file, { hello: true });
    await expect(exclusiveCreateJson(file, { hello: false })).rejects.toBeInstanceOf(
      ExclusiveCreateConflictError,
    );
  });

  it('does not race with parallel callers', async () => {
    const dir = tmp();
    const file = path.join(dir, 'claim2.json');
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        exclusiveCreateJson(file, { i }),
      ),
    );
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
  });
});

describe('cleanupTmpOrphans', () => {
  it('removes leftover .tmp.* files', async () => {
    const dir = tmp();
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(dir, 'real.json'), '{}');
    writeFileSync(path.join(dir, 'real.json.tmp.deadbeef'), 'partial');
    writeFileSync(path.join(dir, 'real.json.tmp.cafebabe'), 'partial');
    const removed = await cleanupTmpOrphans(dir);
    expect(removed).toBe(2);
    expect(existsSync(path.join(dir, 'real.json'))).toBe(true);
  });
});

describe('list helpers', () => {
  it('listJsonFilesSorted returns sorted .json paths', async () => {
    const dir = tmp();
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(path.join(dir, 'sub'));
    writeFileSync(path.join(dir, 'b.json'), '{}');
    writeFileSync(path.join(dir, 'a.json'), '{}');
    writeFileSync(path.join(dir, 'c.txt'), '');
    const entries = await listJsonFilesSorted(dir);
    expect(entries.map((p) => path.basename(p))).toEqual(['a.json', 'b.json']);
  });

  it('listSubdirsSorted skips files', async () => {
    const dir = tmp();
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(path.join(dir, 'b'));
    mkdirSync(path.join(dir, 'a'));
    writeFileSync(path.join(dir, 'c.txt'), '');
    expect(await listSubdirsSorted(dir)).toEqual(['a', 'b']);
  });

  it('returns [] when directory missing', async () => {
    expect(await listJsonFilesSorted(path.join(tmp(), 'absent'))).toEqual([]);
    expect(await listSubdirsSorted(path.join(tmp(), 'absent'))).toEqual([]);
  });
});

describe('sha256File', () => {
  it('matches a known sample', async () => {
    const dir = tmp();
    const file = path.join(dir, 'h.bin');
    const { writeFileSync } = await import('node:fs');
    writeFileSync(file, 'abc');
    expect(await sha256File(file)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
