import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";
import { writeJson } from "../../src/storage/json-file.js";
import { createPaths } from "../../src/storage/paths.js";
import { recordCovered, resetForTests } from "./_harness.js";

let dataRoot: string;
let host1: Awaited<ReturnType<typeof createHybridHost>> | null = null;
let host2: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc11-"));
});

afterEach(async () => {
  if (host1) {
    try {
      await host1.close();
    } catch {
      /* may already be closed */
    }
    host1 = null;
  }
  if (host2) {
    try {
      await host2.close();
    } catch {
      /* ignore */
    }
    host2 = null;
  }
  await rm(dataRoot, { recursive: true, force: true });
  resetForTests();
});

describe("Acceptance C11: confirmed task recovers within 60s after crash", () => {
  it("recoverOnBoot reclaims a stale-locked job within the 60s window", async () => {
    const paths = createPaths(dataRoot);
    const runtimeId = "rt-acc11";

    await mkdir(paths.instanceRoot(runtimeId), { recursive: true });

    const userId = "u_018f5d20-0000-7000-8000-00000000000b";
    const guardLlm = createStubLlmClient(
      {},
      { kind: "json", data: { intent: "new_task", confidence: 0.9, reason: "stub" } },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "crash recovery test",
          description: "task to crash and recover",
          objective: "recover within 60s",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const execLlm = createStubLlmClient({}, { kind: "text", text: "done" });

    // ── Phase 1: plant a confirmed task and a pending job via host1 ────────────

    host1 = await createHybridHost({
      paths,
      runtimeId,
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });

    const thread = await host1.master.threadRepo.create({
      title: "acc11",
      ownerUserId: userId,
    });

    const draftResult = await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc11-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "do recovery thing",
      at: "2026-04-29T00:00:00Z",
    });
    if (draftResult.kind !== "draft_created") throw new Error("expected draft_created");
    const taskId = draftResult.taskId;

    // Confirm the task so a job enters pending
    await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc11-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-29T00:00:01Z",
    });

    // ── Simulate crash: move pending job to locked with a stale/expired lease ──

    const lockedDir = paths.jobsDir(runtimeId, "locked");
    await mkdir(lockedDir, { recursive: true });

    const pendingDir = paths.jobsDir(runtimeId, "pending");
    const pendingFiles = await readdir(pendingDir);
    expect(pendingFiles.length).toBe(1);
    const pendingFile = pendingFiles[0]!;

    const fs = await import("node:fs/promises");
    const jobRaw = await fs.readFile(path.join(pendingDir, pendingFile), "utf8");
    const job = JSON.parse(jobRaw);
    job.lockHolder = "ghost-runtime-crashed";
    job.leaseExpireAt = new Date(Date.now() - 5_000).toISOString(); // expired 5s ago
    await writeJson(path.join(lockedDir, pendingFile), job);
    await fs.unlink(path.join(pendingDir, pendingFile));

    // Close host1 without processing the job (simulates crash/restart)
    await host1.close();
    host1 = null;

    // ── Phase 2: start fresh host and time the recovery ───────────────────────

    const start = Date.now();

    host2 = await createHybridHost({
      paths,
      runtimeId,
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });

    const elapsed = Date.now() - start;

    // C11 spec: recovery must complete within 60 seconds
    expect(elapsed).toBeLessThan(60_000);
    // Realistic budget: recoverOnBoot is a synchronous file scan, should be < 5s
    expect(elapsed).toBeLessThan(5_000);

    // Verify the stale locked job was reclaimed — it should appear in pending or failed,
    // and the task should be back in a re-leaseable / terminal state.
    const failedFiles = await readdir(paths.jobsDir(runtimeId, "failed")).catch(
      () => [] as string[],
    );
    const pendingAfter = await readdir(paths.jobsDir(runtimeId, "pending")).catch(
      () => [] as string[],
    );
    const lockedAfter = await readdir(paths.jobsDir(runtimeId, "locked")).catch(
      () => [] as string[],
    );

    // The stale lock must have been resolved: it's no longer exclusively stuck in locked
    const jobStillStuck =
      lockedAfter.includes(pendingFile) && failedFiles.length === 0 && pendingAfter.length === 0;
    expect(jobStillStuck).toBe(false);

    // Task must have been moved to a recoverable or terminal state
    const task = await host2.master.taskRepo.load(taskId);
    expect(["confirmed", "queued", "running", "failed", "blocked"]).toContain(task?.status);

    recordCovered("C11", "tests/acceptance/11-crash-recovery-within-60s.test.ts");
  }, 70_000); // generous CI timeout; spec is 60s, realistic is < 5s
});
