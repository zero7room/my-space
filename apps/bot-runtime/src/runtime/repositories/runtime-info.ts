import {
  type RuntimeRegistration,
  runtimeRegistrationSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  atomicWriteJson,
  readJson,
} from '@ai-workflow/fs-store';

export class RuntimeInfoRepository {
  constructor(private readonly paths: InstancePaths) {}

  async load(): Promise<RuntimeRegistration | undefined> {
    const raw = await readJson(this.paths.runtimeInfoFile);
    if (!raw) return undefined;
    return runtimeRegistrationSchema.parse(raw);
  }

  async save(reg: RuntimeRegistration): Promise<void> {
    const validated = runtimeRegistrationSchema.parse(reg);
    await atomicWriteJson(this.paths.runtimeInfoFile, validated);
  }
}
