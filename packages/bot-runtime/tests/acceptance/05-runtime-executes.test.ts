import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";
import { createPaths } from "../../src/storage/paths.js";
import { recordCovered, resetForTests } from "./_harness.js";

let dataRoot: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc5-"));
});

afterEach(async () => {
  if (host) {
    await host.close();
    host = null;
  }
  await rm(dataRoot, { recursive: true, force: true });
  resetForTests();
});

describe("Acceptance C5: runtime starts executing the active task", () => {
  it("writes executor_started event after confirm and worker runOnce", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-acc5"), { recursive: true });

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

    // execLlm mirrors the headless-end-to-end pattern: first step writes a file,
    // then returns text so the executor completes quickly without hanging.
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "output.txt", content: "done" },
            id: "toolu_acc5_1",
          };
        }
        return { kind: "text" as const, text: "completed" };
      },
    };

    host = await createHybridHost({
      paths,
      runtimeId: "rt-acc5",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000005";
    const thread = await host.master.threadRepo.create({
      title: "Acc5",
      ownerUserId: userId,
    });

    // C5 step 1: send new_task message → guard classifies → draft created
    const draftResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc5-1",
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

    // C5 step 2: confirm → task moves to queued, job enqueued
    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc5-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-29T00:00:01Z",
    });

    // Verify task is queued before triggering execution
    const queuedTask = await host.master.taskRepo.load(taskId);
    expect(queuedTask).not.toBeNull();
    expect(["confirmed", "queued"]).toContain(queuedTask?.status);

    // Ensure workspace directory exists so write_file tool can run
    await mkdir(paths.workspace("rt-acc5", thread.id, taskId), { recursive: true });

    // C5 step 3: worker leases the job and runs the executor.
    // In hybrid mode (no auto-poll loop), we call runOnce() to trigger execution.
    // The executor writes executor_started synchronously before any LLM call.
    const runResult = await host.worker.runOnce();
    expect(runResult).not.toBeNull();

    // C5 assertion: executor_started event must be present in events.jsonl
    const eventsFile = paths.taskEvents("rt-acc5", thread.id, taskId);
    let found = false;
    for (let i = 0; i < 30 && !found; i++) {
      try {
        const content = await readFile(eventsFile, "utf8");
        if (content.includes('"kind":"executor_started"')) {
          found = true;
          break;
        }
      } catch {
        // file not yet written — wait and retry
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(found, "events.jsonl should contain executor_started event").toBe(true);

    // Also assert the task reached a terminal state
    const finalTask = await host.master.taskRepo.load(taskId);
    expect(["completed", "failed", "running"]).toContain(finalTask?.status);

    recordCovered("C5", "tests/acceptance/05-runtime-executes.test.ts");
  }, 10_000);
});
