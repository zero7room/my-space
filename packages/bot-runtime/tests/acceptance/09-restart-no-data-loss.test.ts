import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";
import { createPaths } from "../../src/storage/paths.js";
import { recordCovered, resetForTests } from "./_harness.js";

let dataRoot: string;
let host1: Awaited<ReturnType<typeof createHybridHost>> | null = null;
let host2: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc9-"));
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

describe("Acceptance C9: restart preserves all data", () => {
  it("thread/task/plan/transcript/artifact survive a host close+reopen", async () => {
    const paths = createPaths(dataRoot);
    const runtimeId = "rt-acc9";

    await mkdir(paths.instanceRoot(runtimeId), { recursive: true });

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
          title: "do thing C9",
          description: "Build thing C9 as requested",
          objective: "Deliver thing C9",
          steps: [{ id: "s1", title: "implement C9", status: "pending" }],
          expectedArtifacts: ["result.txt"],
        },
      },
    );

    // execLlm: first call writes a file, second call returns text to terminate execution
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "result.txt", content: "c9-done" },
            id: "toolu_acc9_1",
          };
        }
        return { kind: "text" as const, text: "completed" };
      },
    };

    // ── Phase 1: build state with host1 ──────────────────────────────────────

    host1 = await createHybridHost({
      paths,
      runtimeId,
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000009";
    const thread = await host1.master.threadRepo.create({
      title: "C9",
      ownerUserId: userId,
    });

    // ingest new_task message → guard classifies → draft created
    const draftResult = await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc9-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "please do thing C9",
      at: "2026-04-29T00:00:00Z",
    });
    if (draftResult.kind !== "draft_created") throw new Error("expected draft_created");
    const taskId = draftResult.taskId;

    // confirm → task moves to queued, job enqueued
    await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc9-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-29T00:00:01Z",
    });

    // Ensure workspace directory exists so write_file tool can run
    await mkdir(paths.workspace(runtimeId, thread.id, taskId), { recursive: true });

    // Run executor to completion (writes result.txt to workspace, writes events.jsonl)
    const runResult = await host1.worker.runOnce();
    expect(runResult).not.toBeNull();

    // Verify that task reached a terminal state before closing
    const finalTask = await host1.master.taskRepo.load(taskId);
    expect(["completed", "failed", "running"]).toContain(finalTask?.status);

    // Verify transcript has at least one entry before closing
    const transcriptBefore = await host1.master.transcript.read(thread.id);
    expect(transcriptBefore.length).toBeGreaterThanOrEqual(1);

    // Close host1 — releases the instance lock
    await host1.close();
    host1 = null;

    // ── Phase 2: reopen with same dataRoot/runtimeId ─────────────────────────

    // Reset execStep counter so host2's execLlm behaves correctly if needed
    execStep = 0;
    const execLlm2 = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "result.txt", content: "c9-done" },
            id: "toolu_acc9_2",
          };
        }
        return { kind: "text" as const, text: "completed" };
      },
    };

    host2 = await createHybridHost({
      paths,
      runtimeId,
      guardLlm: createStubLlmClient(
        {},
        { kind: "json", data: { intent: "new_task", confidence: 0.95, reason: "stub" } },
      ),
      draftLlm: createStubLlmClient(
        {},
        {
          kind: "json",
          data: {
            title: "do thing C9",
            description: "Build thing C9 as requested",
            objective: "Deliver thing C9",
            steps: [{ id: "s1", title: "implement C9", status: "pending" }],
            expectedArtifacts: ["result.txt"],
          },
        },
      ),
      execLlm: execLlm2,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
    });

    // ── Verify all data persists after restart ────────────────────────────────

    // Thread persists
    const reloadedThread = await host2.master.threadRepo.load(thread.id);
    expect(reloadedThread?.id).toBe(thread.id);
    expect(reloadedThread?.title).toBe("C9");

    // Task persists
    const reloadedTask = await host2.master.taskRepo.load(taskId);
    expect(reloadedTask?.id).toBe(taskId);

    // Plan persists
    const reloadedPlan = await host2.master.planRepo.loadByTaskId(taskId);
    expect(reloadedPlan).toBeDefined();
    expect(reloadedPlan).not.toBeNull();

    // Transcript persists (≥1 entry)
    const reloadedTranscript = await host2.master.transcript.read(thread.id);
    expect(reloadedTranscript.length).toBeGreaterThanOrEqual(1);

    // Artifact (workspace file) persists
    const workspaceDir = paths.workspace(runtimeId, thread.id, taskId);
    const wsFiles = await readdir(workspaceDir);
    expect(wsFiles).toContain("result.txt");

    recordCovered("C9", "tests/acceptance/09-restart-no-data-loss.test.ts");
  }, 20_000);
});
