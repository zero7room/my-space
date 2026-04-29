import { readRuntimeInfo } from "./lock.js";
import type { Paths } from "./paths.js";

export type FencingTokenIssuer = {
  issue(): number;
};

export async function createFencingTokenIssuer(
  paths: Paths,
  runtimeId: string,
): Promise<FencingTokenIssuer> {
  const info = await readRuntimeInfo(paths, runtimeId);
  if (!info) throw new Error(`runtime-info missing for ${runtimeId}`);
  let counter = info.fencingTokenSeed * 1_000_000;
  return {
    issue: () => ++counter,
  };
}
