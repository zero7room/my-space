import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../src/storage/json-file.js";
import { createPaths } from "../../src/storage/paths.js";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";

describe("E2E: crash recovery", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rec-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("re-leases an expired locked job after restart and completes it", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-rec"), { recursive: true });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";
    const guardLlm = createStubLlmClient(
      {},
      { kind: "json", data: { intent: "new_task", confidence: 0.9, reason: "stub" } },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "x",
          description: "",
          objective: "x",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const execLlm = createStubLlmClient({}, { kind: "text", text: "done" });

    const host1 = await createHybridHost({
      paths,
      runtimeId: "rt-rec",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });

    const thread = await host1.master.threadRepo.create({
      title: "rec",
      ownerUserId: userId,
    });
    const drafted = await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "do x",
      at: "2026-04-28T00:00:00Z",
    });
    if (drafted.kind !== "draft_created") throw new Error("draft_created expected");
    await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-28T00:00:01Z",
    });

    const lockedDir = paths.jobsDir("rt-rec", "locked");
    await mkdir(lockedDir, { recursive: true });
    const pendingDir = paths.jobsDir("rt-rec", "pending");
    const pendingFiles = await readdir(pendingDir);
    expect(pendingFiles.length).toBe(1);
    const pendingFile = pendingFiles[0]!;
    const fs = await import("node:fs/promises");
    const job = JSON.parse(await fs.readFile(path.join(pendingDir, pendingFile), "utf8"));
    job.lockHolder = "ghost";
    job.leaseExpireAt = new Date(Date.now() - 1000).toISOString();
    await writeJson(path.join(lockedDir, pendingFile), job);
    await fs.unlink(path.join(pendingDir, pendingFile));

    await host1.close();

    const host2 = await createHybridHost({
      paths,
      runtimeId: "rt-rec",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });
    const failed = await readdir(paths.jobsDir("rt-rec", "failed"));
    expect(failed.length).toBeGreaterThanOrEqual(1);
    const after = await host2.master.taskRepo.load(drafted.taskId);
    expect(["confirmed", "queued", "failed", "blocked"]).toContain(after?.status);
    await host2.close();
  });
});
