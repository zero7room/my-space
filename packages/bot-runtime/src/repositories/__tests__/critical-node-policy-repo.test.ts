import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createCriticalNodePolicyRepo } from "../critical-node-policy-repo.js";

describe("CriticalNodePolicyRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "cnp-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("save + listEnabled returns enabled policies sorted by scope precedence", async () => {
    const repo = createCriticalNodePolicyRepo(createPaths(dataRoot), "rt-1");
    await repo.save({
      id: "g1",
      scope: "global",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "log_only",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: true,
      createdAt: "2026-04-28T00:00:00Z",
    });
    await repo.save({
      id: "u1",
      scope: "user",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "require_approval",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: true,
      createdAt: "2026-04-28T00:00:00Z",
    });
    await repo.save({
      id: "off",
      scope: "user",
      matcher: { kind: "tool", toolName: "bash" },
      action: "block",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: false,
      createdAt: "2026-04-28T00:00:00Z",
    });
    const enabled = await repo.listEnabled();
    expect(enabled.map((p) => p.id)).toEqual(["g1", "u1"]);
  });
});
