import {
  type Plan,
  type PlanRevision,
  planSchema,
  planRevisionSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  atomicWriteJson,
  ensureDir,
  listJsonFilesSorted,
  readJson,
} from '@ai-workflow/fs-store';

export class PlanRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(threadId: string, plan: Plan): Promise<Plan> {
    const validated = planSchema.parse(plan);
    await atomicWriteJson(
      this.paths.taskPlanFile(threadId, validated.taskId),
      validated,
    );
    return validated;
  }

  async get(threadId: string, taskId: string): Promise<Plan | undefined> {
    const raw = await readJson(this.paths.taskPlanFile(threadId, taskId));
    if (!raw) return undefined;
    return planSchema.parse(raw);
  }
}

export class PlanRevisionRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(threadId: string, rev: PlanRevision): Promise<PlanRevision> {
    const validated = planRevisionSchema.parse(rev);
    await ensureDir(this.paths.taskPlanRevisionsRoot(threadId, validated.taskId));
    await atomicWriteJson(
      this.paths.taskPlanRevisionFile(threadId, validated.taskId, validated.id),
      validated,
    );
    return validated;
  }

  async get(
    threadId: string,
    taskId: string,
    revisionId: string,
  ): Promise<PlanRevision | undefined> {
    const raw = await readJson(
      this.paths.taskPlanRevisionFile(threadId, taskId, revisionId),
    );
    if (!raw) return undefined;
    return planRevisionSchema.parse(raw);
  }

  async list(
    threadId: string,
    taskId: string,
  ): Promise<PlanRevision[]> {
    const root = this.paths.taskPlanRevisionsRoot(threadId, taskId);
    await ensureDir(root);
    const files = await listJsonFilesSorted(root);
    const out: PlanRevision[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(planRevisionSchema.parse(raw));
    }
    return out;
  }
}
