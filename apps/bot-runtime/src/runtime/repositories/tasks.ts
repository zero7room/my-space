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
  atomicWriteJson,
  ensureDir,
  listSubdirsSorted,
  readJson,
  readEventsSince,
} from '@ai-workflow/fs-store';

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
