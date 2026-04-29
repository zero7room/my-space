import lockfile from "proper-lockfile";
import { readJson, writeJson } from "./json-file.js";
import type { Paths } from "./paths.js";

export type RuntimeRole = "master" | "worker" | "hybrid";

export type RuntimeInfo = {
  role: RuntimeRole;
  version: string;
  startedAt: string;
  lastSeenAt: string;
  fencingTokenSeed: number;
};

export type ReleaseLock = () => Promise<void>;

export async function acquireInstanceLock(
  paths: Paths,
  runtimeId: string,
  opts: { role: RuntimeRole; version?: string },
): Promise<ReleaseLock> {
  const infoPath = paths.runtimeInfo(runtimeId);
  const previous = await readJson<RuntimeInfo>(infoPath);
  const seed = (previous?.fencingTokenSeed ?? 0) + 1;
  const now = new Date().toISOString();

  const info: RuntimeInfo = {
    role: opts.role,
    version: opts.version ?? "0.0.0",
    startedAt: now,
    lastSeenAt: now,
    fencingTokenSeed: seed,
  };
  await writeJson(infoPath, info);

  const release = await lockfile.lock(infoPath, {
    realpath: false,
    retries: 0,
    stale: 60_000,
  });

  return async () => {
    await release();
  };
}

export async function readRuntimeInfo(
  paths: Paths,
  runtimeId: string,
): Promise<RuntimeInfo | null> {
  return readJson<RuntimeInfo>(paths.runtimeInfo(runtimeId));
}

export async function touchRuntimeInfo(
  paths: Paths,
  runtimeId: string,
): Promise<void> {
  const cur = await readRuntimeInfo(paths, runtimeId);
  if (!cur) throw new Error(`runtime-info missing for ${runtimeId}`);
  cur.lastSeenAt = new Date().toISOString();
  await writeJson(paths.runtimeInfo(runtimeId), cur);
}

// `releaseInstanceLock` is intentionally an alias re-exported for callers that
// prefer to import the release helper as a named function. The actual release
// happens via the closure returned from acquireInstanceLock; this export exists
// so the test imports cleanly.
export const releaseInstanceLock = async (release: ReleaseLock): Promise<void> => {
  await release();
};
