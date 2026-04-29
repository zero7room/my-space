import { acquireInstanceLock, type ReleaseLock } from "../storage/lock.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import type { LlmClient } from "../llm/client.js";
import type { Paths } from "../storage/paths.js";
import { createMasterHost, type MasterHost } from "./master-host.js";
import { createWorkerHost, type WorkerHost } from "./worker-host.js";

export type CreateHybridHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  execLlm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
};

export type HybridHost = {
  master: MasterHost;
  worker: WorkerHost;
  close(): Promise<void>;
};

export async function createHybridHost(
  input: CreateHybridHostInput,
): Promise<HybridHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "hybrid",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });

  const master = await createMasterHost({
    paths: input.paths,
    runtimeId: input.runtimeId,
    guardLlm: input.guardLlm,
    draftLlm: input.draftLlm,
    systemPrompt: input.systemPrompt,
    existingLock: { release: async () => undefined, skipBoot: true },
  });
  const worker = await createWorkerHost({
    paths: input.paths,
    runtimeId: input.runtimeId,
    llm: input.execLlm,
    systemPrompt: input.systemPrompt,
    maxSteps: input.maxSteps,
    leaseMs: input.leaseMs,
    existingLock: { release: async () => undefined, skipBoot: true },
  });

  return {
    master,
    worker,
    async close() {
      await master.close();
      await worker.close();
      await release();
    },
  };
}
