import {
  type Task,
  type TaskList,
  type TaskControl,
  type EventEnvelope,
  taskSchema,
  taskListSchema,
  taskControlSchema,
  eventEnvelopeSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  appendEvent,
  atomicRename,
  atomicWriteJson,
  ensureDir,
  listSubdirsSorted,
  readJson,
  readEventsSince,
} from '@ai-workflow/fs-store';
import * as fs from 'node:fs/promises';
import path from 'node:path';

function getMaxBytes(): number {
  return Number.parseInt(
    process.env['RUNTIME_EVENTS_JSONL_MAX_BYTES'] ?? `${64 * 1024 * 1024}`,
    10,
  );
}
function getMaxAgeDays(): number {
  return Number.parseInt(
    process.env['RUNTIME_EVENTS_JSONL_MAX_AGE_DAYS'] ?? '30',
    10,
  );
}

/**
 * Rotate `events.jsonl` when it exceeds `MAX_BYTES` or its mtime is older than
 * `MAX_AGE_DAYS`. The rotated file moves to `events-archive/<id>.jsonl` and
 * the active file is restarted empty. The seq sidecar is preserved so seq
 * counts keep advancing.
 *
 * Returns rotation metadata when a rotation happened so the caller can append
 * an `events_jsonl_rotated` (or `events_jsonl_rotation_failed`) marker into
 * the freshly-restarted log per acceptance #44.
 */
async function maybeRotateEventsLog(
  logPath: string,
): Promise<
  | { rotated: false }
  | {
      rotated: true;
      archivedFile: string;
      archivedSize: number;
      archivedAgeDays: number;
      reason: 'size_overflow' | 'age_overflow';
      activeSizeBytes: number;
    }
  | {
      rotated: false;
      failed: true;
      errorClass: 'io_error' | 'compress_error' | 'rename_error';
    }
> {
  let stat: import('node:fs').Stats;
  try {
    stat = await fs.stat(logPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { rotated: false };
    throw err;
  }
  const ageMs = Date.now() - stat.mtimeMs;
  const tooBig = stat.size >= getMaxBytes();
  const tooOld = ageMs >= getMaxAgeDays() * 24 * 60 * 60 * 1000;
  if (!tooBig && !tooOld) return { rotated: false };
  const dir = path.join(path.dirname(logPath), 'events-archive');
  try {
    await ensureDir(dir);
  } catch {
    return { rotated: false, failed: true, errorClass: 'io_error' };
  }
  // Acceptance 44: archive-id = <startTimestamp>-<endTimestamp>-<sha256-prefix-8>
  const start = Math.floor(stat.birthtimeMs ?? stat.ctimeMs).toString(36);
  const end = Math.floor(stat.mtimeMs).toString(36);
  const { createHash } = await import('node:crypto');
  const hashPrefix = createHash('sha256')
    .update(`${logPath}-${stat.size}-${end}-${Math.random()}`)
    .digest('hex')
    .slice(0, 8);
  const archiveId = `${start}-${end}-${hashPrefix}`;
  const target = path.join(dir, `${archiveId}.jsonl`);
  try {
    await atomicRename(logPath, target);
  } catch {
    return { rotated: false, failed: true, errorClass: 'rename_error' };
  }
  return {
    rotated: true,
    archivedFile: target,
    archivedSize: stat.size,
    archivedAgeDays: Math.floor(ageMs / (24 * 60 * 60 * 1000)),
    reason: tooBig ? 'size_overflow' : 'age_overflow',
    activeSizeBytes: 0,
  };
}

export class TaskRepository {
  constructor(private readonly paths: InstancePaths) {}

  async create(task: Task): Promise<Task> {
    const validated = taskSchema.parse(task);
    await ensureDir(this.paths.taskRoot(validated.threadId, validated.id));
    await atomicWriteJson(
      this.paths.taskFile(validated.threadId, validated.id),
      validated,
    );
    return validated;
  }

  async update(task: Task): Promise<Task> {
    return this.create(task);
  }

  async get(threadId: string, taskId: string): Promise<Task | undefined> {
    const raw = await readJson(this.paths.taskFile(threadId, taskId));
    if (!raw) return undefined;
    return taskSchema.parse(raw);
  }

  async listForThread(threadId: string): Promise<Task[]> {
    const root = this.paths.threadTasksRoot(threadId);
    const subs = await listSubdirsSorted(root);
    const out: Task[] = [];
    for (const id of subs) {
      const t = await this.get(threadId, id);
      if (t) out.push(t);
    }
    return out;
  }

  async appendEvent(
    threadId: string,
    taskId: string,
    event: Omit<EventEnvelope, 'id' | 'seq'>,
  ): Promise<EventEnvelope> {
    const log = this.paths.taskEventsLog(threadId, taskId);
    const rot = await maybeRotateEventsLog(log);
    if (rot.rotated === true) {
      // Append a marker into the freshly-restarted log so retry-history
      // (and the SSE stream after replay) sees the rotation breakpoint.
      await appendEvent(log, {
        kind: 'events_jsonl_rotated',
        threadId,
        taskId,
        payload: {
          archivedFile: rot.archivedFile,
          archivedSize: rot.archivedSize,
          archivedAgeDays: rot.archivedAgeDays,
          reason: rot.reason,
        },
        at: new Date().toISOString(),
      });
    } else if ('failed' in rot && rot.failed) {
      await appendEvent(log, {
        kind: 'events_jsonl_rotation_failed',
        threadId,
        taskId,
        payload: {
          errorClass: rot.errorClass,
        },
        at: new Date().toISOString(),
      });
    }
    const written = await appendEvent(log, { ...event, kind: event.kind });
    return eventEnvelopeSchema.parse(written);
  }

  async readEventsSince(
    threadId: string,
    taskId: string,
    seq?: number,
  ): Promise<EventEnvelope[]> {
    const log = this.paths.taskEventsLog(threadId, taskId);
    const lines = await readEventsSince<EventEnvelope>(log, seq);
    return lines.map((l) => eventEnvelopeSchema.parse(l));
  }

  async writeControl(
    threadId: string,
    taskId: string,
    control: TaskControl,
  ): Promise<void> {
    const validated = taskControlSchema.parse(control);
    await atomicWriteJson(
      this.paths.taskControlFile(threadId, taskId),
      validated,
    );
  }

  async readControl(
    threadId: string,
    taskId: string,
  ): Promise<TaskControl | undefined> {
    const raw = await readJson(this.paths.taskControlFile(threadId, taskId));
    if (!raw) return undefined;
    return taskControlSchema.parse(raw);
  }
}

export class TaskListRepository {
  constructor(private readonly paths: InstancePaths) {}

  async load(threadId: string): Promise<TaskList | undefined> {
    const raw = await readJson(this.paths.threadTaskListFile(threadId));
    if (!raw) return undefined;
    return taskListSchema.parse(raw);
  }

  async save(list: TaskList): Promise<TaskList> {
    const validated = taskListSchema.parse(list);
    await atomicWriteJson(
      this.paths.threadTaskListFile(validated.threadId),
      validated,
    );
    return validated;
  }
}
