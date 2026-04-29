import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createInboundEventRepo } from "../inbound-event-repo.js";

let tmp: string;
let runtimeId: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ier-"));
  runtimeId = "rt_test";
});

describe("InboundEventRepo", () => {
  it("writes a received event then transitions to processed", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "evt-1", { externalMessageId: "msg-a" });
    const got = await repo.load("feishu", "evt-1");
    expect(got?.status).toBe("received");
    expect(got?.externalMessageId).toBe("msg-a");

    await repo.markProcessed("feishu", "evt-1");
    const after = await repo.load("feishu", "evt-1");
    expect(after?.status).toBe("processed");
    expect(after?.processedAt).toBeDefined();
  });

  it("isDuplicate returns true for known event ids", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    expect(await repo.isDuplicate("feishu", "evt-2")).toBe(false);
    await repo.recordReceived("feishu", "evt-2", {});
    expect(await repo.isDuplicate("feishu", "evt-2")).toBe(true);
  });

  it("markSkipped flips status to skipped with reason", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "evt-3", {});
    await repo.markSkipped("feishu", "evt-3", "no-binding");
    const got = await repo.load("feishu", "evt-3");
    expect(got?.status).toBe("skipped");
  });

  it("markFailed records the lastError", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "evt-4", {});
    await repo.markFailed("feishu", "evt-4", "verify-failed");
    const got = await repo.load("feishu", "evt-4");
    expect(got?.status).toBe("failed");
  });
});
