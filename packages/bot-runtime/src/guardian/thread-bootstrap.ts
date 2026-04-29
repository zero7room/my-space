import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { Paths } from "../storage/paths.js";

export type GuardianThreadBootstrap = {
  ensureGuardianThread(userId: string): Promise<string>;
};

export function createGuardianThreadBootstrap(deps: {
  paths: Paths;
  runtimeId: string;
  threadRepo: ThreadRepo;
}): GuardianThreadBootstrap {
  const indexDir = path.posix.join(
    deps.paths.state(deps.runtimeId),
    "_index",
    "guardian-thread-by-user",
  );

  function file(userId: string) {
    return path.posix.join(indexDir, userId);
  }

  return {
    async ensureGuardianThread(userId) {
      await mkdir(indexDir, { recursive: true });
      try {
        const existing = (await readFile(file(userId), "utf8")).trim();
        if (existing) return existing;
      } catch {
        /* not indexed yet */
      }
      const created = await deps.threadRepo.create({
        ownerUserId: userId,
        title: "Guardian",
      });
      await writeFile(file(userId), created.id, "utf8");
      return created.id;
    },
  };
}
