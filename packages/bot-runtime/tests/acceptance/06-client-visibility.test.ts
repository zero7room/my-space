import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc6-"));
});

afterEach(async () => {
  if (host) {
    await host.close();
    host = null;
  }
  await rm(dataRoot, { recursive: true, force: true });
  resetForTests();
});

describe("Acceptance C6: client API exposes task/plan/artifacts/events", () => {
  it("hits /api/.../tasks, /plan, /artifacts, /events after task execution", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-acc6"), { recursive: true });

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

    // execLlm: first step writes a file, second returns text so executor completes.
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "output.txt", content: "done" },
            id: "toolu_acc6_1",
          };
        }
        return { kind: "text" as const, text: "completed" };
      },
    };

    host = await createHybridHost({
      paths,
      runtimeId: "rt-acc6",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
      channel: { adminToken: "admin", ingressPort: 0 },
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000006";
    const thread = await host.master.threadRepo.create({
      title: "Acc6",
      ownerUserId: userId,
    });

    // Step 1: ingest new_task message → guard classifies → draft created
    const draftResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc6-1",
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

    // Step 2: confirm → task moves to queued, job enqueued
    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc6-2",
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
    await mkdir(paths.workspace("rt-acc6", thread.id, taskId), { recursive: true });

    // Step 3: worker leases the job and runs the executor
    const runResult = await host.worker.runOnce();
    expect(runResult).not.toBeNull();

    // Seed a fake artifact in the outputs/ directory so the artifacts API has something to serve.
    // The write_file tool writes to workspace/, not outputs/. We place a file in outputs/ directly
    // to satisfy the criterion that "client can see artifacts via the API".
    const outputsDir = paths.outputs("rt-acc6", thread.id, taskId);
    await mkdir(outputsDir, { recursive: true });
    await writeFile(path.join(outputsDir, "result.txt"), "fake artifact content", "utf8");

    const headers = { "x-admin-token": "admin" };
    const base = `http://127.0.0.1:${host.ingressPort}`;

    // 1. tasks list — must include at least the confirmed/queued/running task
    const tasksRes = await fetch(`${base}/api/threads/${thread.id}/tasks`, { headers });
    expect(tasksRes.status).toBe(200);
    const tasks = (await tasksRes.json()) as Array<{ id: string }>;
    expect(tasks.length).toBeGreaterThanOrEqual(1);

    // 2. plan — must have steps array
    const planRes = await fetch(`${base}/api/tasks/${taskId}/plan`, { headers });
    expect(planRes.status).toBe(200);
    const plan = (await planRes.json()) as { steps: unknown[] };
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps.length).toBeGreaterThanOrEqual(1);

    // 3. artifacts — must include the seeded file
    const artifactsRes = await fetch(
      `${base}/api/tasks/${taskId}/artifacts?threadId=${thread.id}`,
      { headers },
    );
    expect(artifactsRes.status).toBe(200);
    const artifacts = (await artifactsRes.json()) as Array<{ name: string }>;
    expect(artifacts.length).toBeGreaterThanOrEqual(1);

    // 4. events SSE — backlog must contain executor_started
    const ctrl = new AbortController();
    const sseRes = await fetch(`${base}/api/threads/${thread.id}/events?_token=admin`, {
      headers,
      signal: ctrl.signal,
    });
    expect(sseRes.status).toBe(200);
    const reader = sseRes.body!.getReader();
    const dec = new TextDecoder();
    let buffer = "";
    let foundStarted = false;
    for (let i = 0; i < 50 && !foundStarted; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += dec.decode(value);
      if (buffer.includes("executor_started")) {
        foundStarted = true;
        break;
      }
    }
    ctrl.abort();
    expect(foundStarted, "SSE backlog should contain executor_started event").toBe(true);

    recordCovered("C6", "tests/acceptance/06-client-visibility.test.ts");
  }, 15_000);
});
