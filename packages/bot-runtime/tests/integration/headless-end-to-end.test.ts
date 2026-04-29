import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";
import { createPaths } from "../../src/storage/paths.js";

describe("E2E: inbound → guard → draft → confirm → execute → artifact", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "e2e-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("completes full flow with stub LLMs and writes a workspace artifact", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-e2e"), { recursive: true });

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
          title: "write hello",
          description: "make a hello.txt",
          objective: "produce hello.txt with text 'world'",
          steps: [{ id: "s1", title: "write file", status: "pending" }],
          expectedArtifacts: ["hello.txt"],
        },
      },
    );
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "hello.txt", content: "world" },
            id: "toolu_1",
          };
        }
        return { kind: "text" as const, text: "done" };
      },
    };

    const host = await createHybridHost({
      paths,
      runtimeId: "rt-e2e",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you write files",
      maxSteps: 5,
      leaseMs: 60_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";
    const thread = await host.master.threadRepo.create({
      title: "e2e",
      ownerUserId: userId,
    });

    const drafted = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "make me a hello.txt",
      at: "2026-04-28T00:00:00Z",
    });
    if (drafted.kind !== "draft_created") throw new Error("expected draft_created");

    await host.master.ingestInbound({
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
    await mkdir(paths.workspace("rt-e2e", thread.id, drafted.taskId), { recursive: true });

    const result = await host.worker.runOnce();
    expect(result?.outcome).toBe("completed");

    const ws = paths.workspace("rt-e2e", thread.id, drafted.taskId);
    const wsFiles = await readdir(ws);
    expect(wsFiles).toContain("hello.txt");

    const final = await host.master.taskRepo.load(drafted.taskId);
    expect(final?.status).toBe("completed");

    await host.close();
  });
});
