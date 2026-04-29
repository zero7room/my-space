import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { evaluateCriticalNode } from "../../src/executor/critical-node-policy.js";
import { createCriticalNodePolicyRepo } from "../../src/repositories/critical-node-policy-repo.js";
import { newId } from "../../src/storage/ids.js";
import { createPaths } from "../../src/storage/paths.js";
import { recordCovered, resetForTests } from "./_harness.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "acc12-"));
});

afterEach(() => {
  resetForTests();
});

describe("Acceptance C12: CriticalNodePolicy applied without service restart", () => {
  it("a newly written external_io policy affects the next evaluation", async () => {
    const paths = createPaths(tmp);
    const repo = createCriticalNodePolicyRepo(paths, runtimeId);

    // Phase 1: no policies → no hits
    let policies = await repo.listEnabled();
    let decisions = evaluateCriticalNode({
      toolName: "notify_bound_channel",
      input: { direction: "outbound" },
      policies,
    });
    expect(decisions).toHaveLength(0);

    // Phase 2: write a new external_io / require_approval policy to disk
    const policyId = newId("policy");
    const userId = newId("u");
    await repo.save({
      id: policyId,
      scope: "global",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "require_approval",
      ownerUserId: userId,
      enabled: true,
      createdAt: new Date().toISOString(),
    });

    // Phase 3: rebuild evaluator from latest policies (simulates per-call reload)
    // v1 contract: evaluator is constructed fresh on each tool call from persisted policies.
    // True background hot-reload is not implemented in v1; instead the runtime
    // rebuilds the evaluator from disk on every invocation, so writing a policy
    // is sufficient to affect the very next call without any service restart.
    policies = await repo.listEnabled();
    decisions = evaluateCriticalNode({
      toolName: "notify_bound_channel",
      input: { direction: "outbound" },
      policies,
    });
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.action).toBe("require_approval");
    expect(decisions[0]?.policyId).toBe(policyId);

    recordCovered("C12", "tests/acceptance/12-critical-node-policy-hot-reload.test.ts");
  });
});
