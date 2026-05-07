/**
 * Atomic primitives over the local filesystem.
 *
 * - `atomicWriteJson` writes via `<path>.tmp.<rand>` + fsync(file) + fsync(dir)
 *   + rename. Crashes leave at most a stray `.tmp.*` file.
 * - `appendJsonl` opens with O_APPEND and fsyncs after each write. Open-close
 *   per call — fine for the volumes v1 expects.
 * - `exclusiveCreateJson` uses `wx` to atomically claim a path. Used for
 *   chat-claims and dedupe markers.
 *
 * The shared `fsync` semantics rely on Linux/macOS POSIX behaviour. On macOS
 * the rename is durable across crashes only after the parent dir is fsynced,
 * which we do explicitly.
 */
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import stableStringify from 'fast-json-stable-stringify';

import { ExclusiveCreateConflictError } from './errors.js';

function tmpSuffix(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Make sure a directory exists. No-op if already there. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function fsyncDirSync(dir: string): void {
  // Some filesystems disallow fsync on a directory fd opened RDWR; use
  // O_DIRECTORY|O_RDONLY. Errors are swallowed because not all platforms
  // support directory fsync (e.g. Windows). On macOS / Linux it is a no-op
  // failure path that's safe to ignore.
  let fd: number | undefined;
  try {
    fd = openSync(dir, fsConstants.O_DIRECTORY | fsConstants.O_RDONLY);
    try {
      fsyncSync(fd);
    } catch {
      // best-effort
    }
  } catch {
    // dir may not exist on this platform's openSync semantics — caller already
    // mkdir'd, so swallow.
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* noop */
      }
    }
  }
}

/**
 * Atomically write JSON. Stable serialization keeps diffs deterministic.
 */
export async function atomicWriteJson(
  filePath: string,
  data: unknown,
): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = `${filePath}.tmp.${tmpSuffix()}`;
  // Use sync I/O for the write+fsync+rename critical section so we don't
  // interleave with concurrent writes between the write and the rename.
  const fd = openSync(tmp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC, 0o644);
  try {
    writeFileSync(fd, stableStringify(data));
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, filePath);
  fsyncDirSync(dir);
}

/**
 * Read JSON; returns `undefined` if the file is absent.
 */
export async function readJson<T = unknown>(
  filePath: string,
): Promise<T | undefined> {
  try {
    const buf = await fs.readFile(filePath);
    return JSON.parse(buf.toString('utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * Read JSON synchronously. Used by recovery scan.
 */
export function readJsonSync<T = unknown>(filePath: string): T | undefined {
  try {
    const buf = readFileSync(filePath);
    return JSON.parse(buf.toString('utf8')) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

/**
 * `O_CREAT | O_EXCL`. Writes the JSON if and only if the file did not exist.
 */
export async function exclusiveCreateJson(
  filePath: string,
  data: unknown,
): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  let fd: number | undefined;
  try {
    fd = openSync(
      filePath,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL,
      0o644,
    );
    writeFileSync(fd, stableStringify(data));
    fsyncSync(fd);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ExclusiveCreateConflictError(filePath);
    }
    throw err;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* noop */
      }
    }
  }
  fsyncDirSync(dir);
}

/**
 * Append a single JSON value as one JSONL line. Each call fsyncs.
 */
export async function appendJsonl(
  filePath: string,
  data: unknown,
): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const fd = openSync(
    filePath,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_APPEND,
    0o644,
  );
  try {
    writeFileSync(fd, `${JSON.stringify(data)}\n`);
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Read all JSONL lines from `filePath`. Returns `[]` if the file is missing.
 * Tolerant of trailing partial lines (returned from a crash mid-write).
 */
export async function readJsonl<T = unknown>(filePath: string): Promise<T[]> {
  let raw: string;
  try {
    raw = (await fs.readFile(filePath)).toString('utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const out: T[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      // Last line may be partial after a crash; ignore.
    }
  }
  return out;
}

/**
 * Atomically rename. Wraps native rename so callers get the same error type.
 */
export async function atomicRename(
  oldPath: string,
  newPath: string,
): Promise<void> {
  await ensureDir(path.dirname(newPath));
  renameSync(oldPath, newPath);
  fsyncDirSync(path.dirname(newPath));
}

/**
 * Compute SHA-256 of a file.
 */
export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const buf = await fs.readFile(filePath);
  hash.update(buf);
  return hash.digest('hex');
}

/**
 * SHA-256 over a stream. Useful if a future caller streams large artifacts.
 */
export async function sha256Stream(stream: Readable): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of stream) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/**
 * List `*.json` files in a directory, sorted by name. Returns `[]` if missing.
 */
export async function listJsonFilesSorted(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => path.join(dir, e.name))
    .sort();
}

/**
 * List subdirectory names (one level), sorted.
 */
export async function listSubdirsSorted(dir: string): Promise<string[]> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Remove a file if present; no-op otherwise.
 */
export async function removeIfExists(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/**
 * Best-effort cleanup of orphan `.tmp.*` files (left over from crashes).
 * Returns the number cleaned.
 */
export async function cleanupTmpOrphans(dir: string): Promise<number> {
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return 0;
    throw err;
  }
  let count = 0;
  for (const e of entries) {
    if (e.isFile() && /\.tmp\.[A-Za-z0-9-]+$/.test(e.name)) {
      try {
        await fs.unlink(path.join(dir, e.name));
        count++;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }
  }
  return count;
}
