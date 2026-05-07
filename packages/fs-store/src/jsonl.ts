/**
 * JSONL helpers with monotonic per-stream sequence numbers.
 */
import path from 'node:path';

import { newEventId } from '@ai-workflow/contracts';

import { atomicWriteJson, appendJsonl, readJson } from './primitives.js';

interface JsonlSeqMeta {
  next: number;
}

/**
 * Append an event to a JSONL log, attaching a monotonic `seq` and freshly
 * generated `id` if not already present. The seq counter lives at
 * `<logPath>.seq.json` and is updated atomically.
 *
 * Returns the merged event (with seq + id assigned).
 */
export async function appendEvent<
  T extends { kind: string; id?: string; seq?: number },
>(logPath: string, event: T): Promise<T & { id: string; seq: number }> {
  const seqPath = `${logPath}.seq.json`;
  const meta = (await readJson<JsonlSeqMeta>(seqPath)) ?? { next: 0 };
  const seq = meta.next;
  const id = event.id ?? newEventId();
  const next: T & { id: string; seq: number } = {
    ...event,
    id,
    seq,
  };
  await appendJsonl(logPath, next);
  await atomicWriteJson(seqPath, { next: seq + 1 });
  return next;
}

/**
 * Read events from a JSONL log starting at `seq`. If `seq` is undefined, all
 * events are returned. Caller is responsible for capping the result.
 */
import { readJsonl } from './primitives.js';

export async function readEventsSince<T extends { seq: number }>(
  logPath: string,
  seq?: number,
): Promise<T[]> {
  const all = await readJsonl<T>(logPath);
  if (seq === undefined) return all;
  return all.filter((e) => e.seq >= seq);
}

/**
 * Locate the seq file for a JSONL log path (used by recovery scan to repair).
 */
export function seqFileFor(logPath: string): string {
  return `${logPath}.seq.json`;
}

/** Convenience: derive the parent dir of a JSONL log. */
export function jsonlDir(logPath: string): string {
  return path.dirname(logPath);
}
