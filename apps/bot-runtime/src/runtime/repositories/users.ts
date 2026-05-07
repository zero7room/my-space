import {
  type User,
  userSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  atomicWriteJson,
  ensureDir,
  listJsonFilesSorted,
  readJson,
} from '@ai-workflow/fs-store';

export class UserRepository {
  constructor(private readonly paths: InstancePaths) {}

  async upsert(user: User): Promise<User> {
    const validated = userSchema.parse(user);
    await atomicWriteJson(this.paths.userFile(validated.id), validated);
    return validated;
  }

  async get(id: string): Promise<User | undefined> {
    const raw = await readJson(this.paths.userFile(id));
    if (!raw) return undefined;
    return userSchema.parse(raw);
  }

  async list(): Promise<User[]> {
    await ensureDir(this.paths.usersRoot);
    const files = await listJsonFilesSorted(this.paths.usersRoot);
    const out: User[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(userSchema.parse(raw));
    }
    return out;
  }
}
