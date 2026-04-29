import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createUserDirectory } from "../user-bootstrap.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ub-"));
});

describe("UserDirectory", () => {
  it("creates a new user the first time we see an externalUserId", async () => {
    const dir = createUserDirectory(createPaths(tmp), runtimeId);
    const u1 = await dir.resolveOrCreate("feishu", "ou_alice", "Alice");
    expect(u1).toMatch(/^u_/);
  });

  it("returns the same user-id for repeated lookups", async () => {
    const dir = createUserDirectory(createPaths(tmp), runtimeId);
    const u1 = await dir.resolveOrCreate("feishu", "ou_alice", "Alice");
    const u2 = await dir.resolveOrCreate("feishu", "ou_alice", "Alice");
    expect(u1).toBe(u2);
  });

  it("issues different ids for different externalUserIds", async () => {
    const dir = createUserDirectory(createPaths(tmp), runtimeId);
    const u1 = await dir.resolveOrCreate("feishu", "ou_a", "A");
    const u2 = await dir.resolveOrCreate("feishu", "ou_b", "B");
    expect(u1).not.toBe(u2);
  });
});
