import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createPaths } from "../../storage/paths.js";
import { createMasterHost } from "../master-host.js";

describe("MasterHost", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "mh-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("starts and exposes ingestInbound + getThreadLoop", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          intent: "new_task",
          confidence: 0.9,
          reason: "test",
        },
      },
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
    const host = await createMasterHost({
      paths,
      runtimeId: "rt-1",
      guardLlm: llm,
      draftLlm,
      systemPrompt: "x",
    });
    const t = await host.threadRepo.create({
      title: "demo",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
    });
    const result = await host.ingestInbound({
      threadId: t.id,
      messageId: "msg-1",
      fromUserId: t.ownerUserId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "build me a thing",
      at: "2026-04-28T00:00:00Z",
    });
    expect(result.kind).toBe("draft_created");
    await host.close();
  });
});
