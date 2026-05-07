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

const MAX_BYTES = Number.parseInt(
  process.env['RUNTIME_EVENTS_JSONL_MAX_BYTES'] ?? `${64 * 1024 * 1024}`,
  10,
);
const MAX_AGE_DAYS = Number.parseInt(
  process.env['RUNTIME_EVENTS_JSONL_MAX_AGE_DAYS'] ?? '30',
  10,
);

/**
 * Rotate `events.jsonl` when it exceeds `MAX_BYTES` or its mtime is older than
 * `MAX_AGE_DAYS`. The rotated file moves to `events-archive/<id>.jsonl` and
 * the active file is restarted empty. The seq sidecar is preserved so seq
 * counts keep advancing.
 */
async function maybeRotateEventsLog(logPath: string): Promise<void> {
  let stat: import('node:fs').Stats;
  try {
    stat = await fs.stat(logPath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  const ageMs = Date.now() - stat.mtimeMs;
  const tooBig = stat.size >= MAX_BYTES;
  const tooOld = ageMs >= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  if (!tooBig && !tooOld) return;
  const dir = path.join(path.dirname(logPath), 'events-archive');
  await ensureDir(dir);
  const archiveId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const target = path.join(dir, `${archiveId}.jsonl`);
  await atomicRename(logPath, target);
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
    await maybeRotateEventsLog(log);
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
