import {
  type CriticalNodePolicy,
  criticalNodePolicySchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  atomicWriteJson,
  ensureDir,
  listJsonFilesSorted,
  readJson,
  removeIfExists,
} from '@ai-workflow/fs-store';

export class CriticalNodePolicyRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(policy: CriticalNodePolicy): Promise<CriticalNodePolicy> {
    const v = criticalNodePolicySchema.parse(policy);
    await atomicWriteJson(this.paths.policyFile(v.id), v);
    return v;
  }

  async get(id: string): Promise<CriticalNodePolicy | undefined> {
    const raw = await readJson(this.paths.policyFile(id));
    if (!raw) return undefined;
    return criticalNodePolicySchema.parse(raw);
  }

  async list(): Promise<CriticalNodePolicy[]> {
    const root = `${this.paths.stateRoot}/critical-node-policies`;
    await ensureDir(root);
    const files = await listJsonFilesSorted(root);
    const out: CriticalNodePolicy[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(criticalNodePolicySchema.parse(raw));
    }
    return out;
  }

  async delete(id: string): Promise<void> {
    await removeIfExists(this.paths.policyFile(id));
  }
}
