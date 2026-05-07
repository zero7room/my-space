import {
  type ArtifactRecord,
  type ChangeRecord,
  artifactRecordSchema,
  changeRecordSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  atomicWriteJson,
  ensureDir,
  listJsonFilesSorted,
  readJson,
} from '@ai-workflow/fs-store';

export class ArtifactRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(threadId: string, record: ArtifactRecord): Promise<ArtifactRecord> {
    const v = artifactRecordSchema.parse(record);
    await ensureDir(this.paths.taskArtifactsRoot(threadId, v.taskId));
    await atomicWriteJson(
      this.paths.taskArtifactFile(threadId, v.taskId, v.id),
      v,
    );
    return v;
  }

  async get(
    threadId: string,
    taskId: string,
    artifactId: string,
  ): Promise<ArtifactRecord | undefined> {
    const raw = await readJson(
      this.paths.taskArtifactFile(threadId, taskId, artifactId),
    );
    if (!raw) return undefined;
    return artifactRecordSchema.parse(raw);
  }

  async list(threadId: string, taskId: string): Promise<ArtifactRecord[]> {
    const root = this.paths.taskArtifactsRoot(threadId, taskId);
    await ensureDir(root);
    const files = await listJsonFilesSorted(root);
    const out: ArtifactRecord[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(artifactRecordSchema.parse(raw));
    }
    return out;
  }
}

export class ChangeRecordRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(threadId: string, record: ChangeRecord): Promise<ChangeRecord> {
    const v = changeRecordSchema.parse(record);
    await ensureDir(this.paths.taskChangeRecordsRoot(threadId, v.taskId));
    await atomicWriteJson(
      this.paths.taskChangeRecordFile(threadId, v.taskId, v.id),
      v,
    );
    return v;
  }

  async list(threadId: string, taskId: string): Promise<ChangeRecord[]> {
    const root = this.paths.taskChangeRecordsRoot(threadId, taskId);
    await ensureDir(root);
    const files = await listJsonFilesSorted(root);
    const out: ChangeRecord[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(changeRecordSchema.parse(raw));
    }
    return out;
  }
}
