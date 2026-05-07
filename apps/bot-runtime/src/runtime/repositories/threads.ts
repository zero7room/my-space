import {
  type Thread,
  type GuardDecision,
  threadSchema,
  guardDecisionSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  appendEvent,
  atomicWriteJson,
  ensureDir,
  listSubdirsSorted,
  readJson,
  readJsonl,
} from '@ai-workflow/fs-store';

export interface TranscriptEntry {
  id: string;
  threadId: string;
  fromUserId?: string;
  source: string;
  text: string;
  at: string;
  /** Frontend-supplied dedupe id (POST /messages clientMessageId). */
  clientMessageId?: string;
  seq?: number;
}

export class ThreadRepository {
  constructor(private readonly paths: InstancePaths) {}

  async create(thread: Thread): Promise<Thread> {
    const validated = threadSchema.parse(thread);
    await ensureDir(this.paths.threadRoot(validated.id));
    await atomicWriteJson(this.paths.threadFile(validated.id), validated);
    return validated;
  }

  async update(thread: Thread): Promise<Thread> {
    return this.create(thread);
  }

  async get(id: string): Promise<Thread | undefined> {
    const raw = await readJson(this.paths.threadFile(id));
    if (!raw) return undefined;
    return threadSchema.parse(raw);
  }

  async list(): Promise<Thread[]> {
    await ensureDir(this.paths.threadsRoot);
    const subs = await listSubdirsSorted(this.paths.threadsRoot);
    const out: Thread[] = [];
    for (const id of subs) {
      const t = await this.get(id);
      if (t) out.push(t);
    }
    return out;
  }

  async appendTranscript(threadId: string, entry: TranscriptEntry): Promise<TranscriptEntry & { seq: number }> {
    const log = this.paths.threadTranscript(threadId);
    return appendEvent(log, entry as TranscriptEntry & { kind: string });
  }

  async readTranscript(threadId: string): Promise<TranscriptEntry[]> {
    return readJsonl<TranscriptEntry>(this.paths.threadTranscript(threadId));
  }

  async appendGuardDecision(decision: GuardDecision): Promise<GuardDecision & { seq: number }> {
    const validated = guardDecisionSchema.parse(decision);
    const log = this.paths.threadGuardLog(validated.threadId);
    const out = await appendEvent(log, { ...validated, kind: 'guard_decision' as const });
    return out as unknown as GuardDecision & { seq: number };
  }

  async readGuardDecisions(threadId: string): Promise<GuardDecision[]> {
    const lines = await readJsonl<GuardDecision & { kind: string; seq: number }>(
      this.paths.threadGuardLog(threadId),
    );
    return lines.map(({ kind: _kind, seq: _seq, ...rest }) => guardDecisionSchema.parse(rest));
  }

  async writeDraftTask(threadId: string, draft: unknown | undefined): Promise<void> {
    if (draft === undefined) {
      const { removeIfExists } = await import('@ai-workflow/fs-store');
      await removeIfExists(this.paths.threadDraftTask(threadId));
      return;
    }
    await atomicWriteJson(this.paths.threadDraftTask(threadId), draft);
  }

  async readDraftTask(threadId: string): Promise<unknown> {
    return readJson(this.paths.threadDraftTask(threadId));
  }

  async writeDraftPlan(threadId: string, draft: unknown | undefined): Promise<void> {
    if (draft === undefined) {
      const { removeIfExists } = await import('@ai-workflow/fs-store');
      await removeIfExists(this.paths.threadDraftPlan(threadId));
      return;
    }
    await atomicWriteJson(this.paths.threadDraftPlan(threadId), draft);
  }

  async readDraftPlan(threadId: string): Promise<unknown> {
    return readJson(this.paths.threadDraftPlan(threadId));
  }
}
