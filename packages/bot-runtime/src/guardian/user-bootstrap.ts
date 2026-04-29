import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type User, UserSchema } from "../schema/user.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type UserDirectory = {
  resolveOrCreate(provider: string, externalUserId: string, displayName: string): Promise<string>;
  load(userId: string): Promise<User | null>;
};

export function createUserDirectory(paths: Paths, runtimeId: string): UserDirectory {
  const usersDir = path.posix.join(paths.state(runtimeId), "users");
  const indexDir = path.posix.join(paths.state(runtimeId), "_index", "user-by-external");

  function indexFile(provider: string, externalUserId: string) {
    return path.posix.join(indexDir, provider, externalUserId);
  }

  function userFile(userId: string) {
    return path.posix.join(usersDir, `${userId}.json`);
  }

  return {
    async resolveOrCreate(provider, externalUserId, displayName) {
      await mkdir(path.posix.join(indexDir, provider), { recursive: true });
      const idxFile = indexFile(provider, externalUserId);
      try {
        const existing = (await readFile(idxFile, "utf8")).trim();
        if (existing) return existing;
      } catch {
        /* not yet indexed */
      }
      const userId = newId("u");
      const now = new Date().toISOString();
      const user = UserSchema.parse({
        id: userId,
        displayName,
        channelIdentities:
          provider === "feishu"
            ? { feishu: { openId: externalUserId } }
            : provider === "slack"
              ? { slack: { userId: externalUserId, teamId: "" } }
              : {},
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(usersDir, { recursive: true });
      await writeJson(userFile(userId), user);
      await writeFile(idxFile, userId, "utf8");
      return userId;
    },
    async load(userId) {
      const got = await readJson(userFile(userId));
      return got ? UserSchema.parse(got) : null;
    },
  };
}
