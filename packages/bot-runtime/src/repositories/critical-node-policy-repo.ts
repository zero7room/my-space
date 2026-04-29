import { mkdir, readdir } from "node:fs/promises";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";
import {
  type CriticalNodePolicy,
  CriticalNodePolicySchema,
} from "../schema/critical-node.js";

const SCOPE_ORDER: Record<CriticalNodePolicy["scope"], number> = {
  global: 0,
  user: 1,
  thread: 2,
  skill: 3,
};

export type CriticalNodePolicyRepo = {
  save(policy: CriticalNodePolicy): Promise<void>;
  load(policyId: string): Promise<CriticalNodePolicy | null>;
  listEnabled(): Promise<CriticalNodePolicy[]>;
  remove(policyId: string): Promise<void>;
};

export function createCriticalNodePolicyRepo(
  paths: Paths,
  runtimeId: string,
): CriticalNodePolicyRepo {
  return {
    async save(policy) {
      const validated = CriticalNodePolicySchema.parse(policy);
      await writeJson(
        paths.criticalNodePolicy(runtimeId, validated.id),
        validated,
      );
    },
    async load(policyId) {
      const raw = await readJson(paths.criticalNodePolicy(runtimeId, policyId));
      return raw ? CriticalNodePolicySchema.parse(raw) : null;
    },
    async listEnabled() {
      const dir = paths.criticalNodePolicy(runtimeId, "").replace(/\/$/, "");
      const root = dir.split("/").slice(0, -1).join("/");
      await mkdir(root, { recursive: true });
      const files = (await readdir(root)).filter((f) => f.endsWith(".json"));
      const out: CriticalNodePolicy[] = [];
      for (const f of files) {
        const id = f.slice(0, -".json".length);
        const p = await this.load(id);
        if (p?.enabled) out.push(p);
      }
      return out.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]);
    },
    async remove(policyId) {
      const fs = await import("node:fs/promises");
      try {
        await fs.unlink(paths.criticalNodePolicy(runtimeId, policyId));
      } catch {
        /* already gone */
      }
    },
  };
}
