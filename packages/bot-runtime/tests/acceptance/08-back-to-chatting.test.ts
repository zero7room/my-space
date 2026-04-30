import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";
import { newId } from "../../src/storage/ids.js";
import { createPaths } from "../../src/storage/paths.js";
import { recordCovered, resetForTests } from "./_harness.js";

let dataRoot: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc8-"));
});

afterEach(async () => {
  if (host) {
    await host.close();
    host = null;
  }
  await rm(dataRoot, { recursive: true, force: true });
  resetForTests();
});

describe("Acceptance C8: thread returns to chatting after task completion", () => {
  it("thread accepts a new task draft after the first task completes", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-acc8"), { recursive: true });

    const guardLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: { intent: "new_task", confidence: 0.95, reason: "stub" },
      },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "do thing X",
          description: "Build thing X as requested",
          objective: "Deliver thing X",
          steps: [{ id: "s1", title: "implement X", status: "pending" }],
          expectedArtifacts: ["output.txt"],
        },
      },
    );

    // execLlm: first step writes a file, second step returns text → executor
    // completes quickly without hanging (mirrors acc05 pattern).
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "output.txt", content: "done" },
            id: "toolu_acc8_1",
          };
        }
        return { kind: "text" as const, text: "completed" };
      },
    };

    host = await createHybridHost({
      paths,
      runtimeId: "rt-acc8",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
    });

    const userId = newId("u");
    const thread = await host.master.threadRepo.create({
      title: "Acc8",
      ownerUserId: userId,
    });

    // ── Step 1: ingest first new_task message → draft created ──
    const draftResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: newId("msg"),
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "please do thing X",
      at: "2026-04-29T00:00:00Z",
    });
    if (draftResult.kind !== "draft_created") throw new Error("expected draft_created");
    const taskId = draftResult.taskId;

    // ── Step 2: confirm → task queued, job enqueued ──
    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: newId("msg"),
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-29T00:00:01Z",
    });

    const queuedTask = await host.master.taskRepo.load(taskId);
    expect(queuedTask).not.toBeNull();
    expect(["confirmed", "queued"]).toContain(queuedTask?.status);

    // Ensure workspace dir exists so write_file tool can operate
    await mkdir(paths.workspace("rt-acc8", thread.id, taskId), { recursive: true });

    // ── Step 3: worker runs executor to completion ──
    const runResult = await host.worker.runOnce();
    expect(runResult).not.toBeNull();
    expect(runResult?.outcome).toBe("completed");

    // ── Assertion 1: task is completed ──
    const completedTask = await host.master.taskRepo.load(taskId);
    expect(completedTask?.status).toBe("completed");

    // ── Assertion 2: thread status resets to chatting after task completion ──
    const tAfterRun = await host.master.threadRepo.load(thread.id);
    expect(tAfterRun).not.toBeNull();
    expect(["chatting", "idle"]).toContain(tAfterRun?.status);

    // ── Assertion 3 (primary): thread accepts a NEW task even while status="working" ──
    // ThreadLoop.new_task branch does not guard on thread.status,
    // so a follow-up message still produces a new draft.  This is the
    // user-visible behaviour that matters for C8.
    const followupResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: newId("msg"),
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "now please do thing Y",
      at: "2026-04-29T00:00:02Z",
    });

    expect(followupResult.kind).toBe("draft_created");
    if (followupResult.kind !== "draft_created") throw new Error("expected draft_created");

    // New draft should be a different task from the first one
    expect(followupResult.taskId).not.toBe(taskId);

    // Thread should now have a new draftTaskId
    const tAfterFollowup = await host.master.threadRepo.load(thread.id);
    expect(tAfterFollowup?.draftTaskId).toBe(followupResult.taskId);

    recordCovered("C8", "tests/acceptance/08-back-to-chatting.test.ts");
  }, 15_000);
});
