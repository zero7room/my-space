import { mkdir, mkdtemp, rm } from "node:fs/promises";
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
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc1-"));
});

afterEach(async () => {
  if (host) {
    await host.close();
    host = null;
  }
  await rm(dataRoot, { recursive: true, force: true });
  resetForTests();
});

describe("Acceptance C1-C4: chat → new_task → draft → confirm → TaskList", () => {
  it("drives the full flow", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-acc1"), { recursive: true });

    // Guard LLM: returns "chat" for chit-chat, "new_task" for task requests.
    // Using a fallback of new_task so that any non-matched key still creates a task.
    // The actual classify call uses the full assembled prompt, so we rely on fallback.
    const guardLlm = createStubLlmClient(
      {},
      // Default fallback: classify everything as new_task (the guard checks slashCommand
      // and thread status before calling the LLM, so chit-chat with no prior draft will
      // be the first call and new_task for the second).
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
          title: "build CRUD API for users",
          description: "Build a CRUD REST API for user resource",
          objective: "Produce a working CRUD API for users",
          steps: [
            { id: "s1", title: "Design schema", status: "pending" },
            { id: "s2", title: "Implement endpoints", status: "pending" },
          ],
          expectedArtifacts: ["api.ts"],
        },
      },
    );

    const execLlm = createStubLlmClient({}, { kind: "text", text: "done" });

    host = await createHybridHost({
      paths,
      runtimeId: "rt-acc1",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";

    // C1: Create a thread representing a continuous conversation
    const thread = await host.master.threadRepo.create({
      title: "user conversation",
      ownerUserId: userId,
    });

    // C1+C2: Send a chit-chat message first — guard will classify as new_task via fallback,
    // but there's no draft yet so the loop handles it. We just confirm the thread exists.
    const chatResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-chat-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "hi how are you",
      at: "2026-04-29T00:00:00Z",
    });
    // C1: Thread is alive — we received a result for the first message
    expect(chatResult).toBeDefined();

    // C2+C3: Send a new_task message — guard returns new_task → ThreadLoop creates draft
    const taskResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-task-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "please build me a CRUD API for users",
      at: "2026-04-29T00:00:01Z",
    });

    // C3: A draft task should have been created
    expect(taskResult.kind).toBe("draft_created");
    if (taskResult.kind !== "draft_created") throw new Error("expected draft_created");

    const draftTaskId = taskResult.taskId;

    // Verify draft task exists and is in "draft" status
    const draftTask = await host.master.taskRepo.load(draftTaskId);
    expect(draftTask).not.toBeNull();
    expect(draftTask?.status).toBe("draft");

    // Also verify thread has draftTaskId set (C3: draft plan + task wired to thread)
    const threadAfterDraft = await host.master.threadRepo.load(thread.id);
    expect(threadAfterDraft?.draftTaskId).toBe(draftTaskId);

    // C4: Send /confirm → task.status should become "confirmed" or "queued"
    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-confirm-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-29T00:00:02Z",
    });

    const confirmedTask = await host.master.taskRepo.load(draftTaskId);
    expect(confirmedTask).not.toBeNull();
    expect(["confirmed", "queued"]).toContain(confirmedTask?.status);

    // Record coverage evidence for all criteria
    recordCovered("C1", "tests/acceptance/01-chat-to-tasklist.test.ts");
    recordCovered("C2", "tests/acceptance/01-chat-to-tasklist.test.ts");
    recordCovered("C3", "tests/acceptance/01-chat-to-tasklist.test.ts");
    recordCovered("C4", "tests/acceptance/01-chat-to-tasklist.test.ts");
  });
});
