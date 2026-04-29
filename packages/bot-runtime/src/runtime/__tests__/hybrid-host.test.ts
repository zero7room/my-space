import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createStubLlmClient } from "../../llm/client.js";
import { createHybridHost } from "../hybrid-host.js";

describe("HybridHost", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "hh-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("ingests inbound, dispatches, and worker.runOnce drives task to completion", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
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
          title: "do x",
          description: "",
          objective: "x",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const execLlm = createStubLlmClient({}, { kind: "text", text: "done" });

    const host = await createHybridHost({
      paths,
      runtimeId: "rt-1",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are an AI employee",
      maxSteps: 3,
      leaseMs: 60_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";
    const thread = await host.master.threadRepo.create({
      title: "demo",
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
      messageText: "build me a thing",
      at: "2026-04-28T00:00:00Z",
    });
    expect(drafted.kind).toBe("draft_created");
    if (drafted.kind !== "draft_created") return;

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

    await mkdir(paths.workspace("rt-1", thread.id, drafted.taskId), { recursive: true });

    const result = await host.worker.runOnce();
    expect(result?.outcome).toBe("completed");
    const after = await host.master.taskRepo.load(drafted.taskId);
    expect(after?.status).toBe("completed");
    await host.close();
  });
});
