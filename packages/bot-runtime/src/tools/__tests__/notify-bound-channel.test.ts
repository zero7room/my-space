// packages/bot-runtime/src/tools/__tests__/notify-bound-channel.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChannelOutboundJobQueue } from "../../channel/outbound-job-queue.js";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createNotifyBoundChannelTool } from "../notify-bound-channel.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "nbc-"));
});

describe("notify_bound_channel (real impl)", () => {
  it("returns enqueued and writes a ChannelJob when binding exists", async () => {
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, runtimeId);
    const queue = createChannelOutboundJobQueue(paths, runtimeId);

    const threadId = newId("th");
    const binding = await bindingRepo.create({
      threadId,
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "client",
    });
    await bindingRepo.updateStatus(threadId, "feishu", binding.id, "bound");

    const tool = createNotifyBoundChannelTool({
      bindingRepo,
      queue,
      threadId,
    });
    const out = (await tool.call(
      {
        target: "all",
        message: "hello",
        importance: "info",
      },
      { ctx: {} as never },
    )) as { status: string; jobIds?: string[] };
    expect(out.status).toBe("enqueued");
    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    expect(
      (pending[0]?.payload as { externalConversationId?: string }).externalConversationId,
    ).toBe("oc_x");
  });

  it("returns binding_unavailable when no binding matches", async () => {
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, runtimeId);
    const queue = createChannelOutboundJobQueue(paths, runtimeId);
    const threadId = newId("th");
    const tool = createNotifyBoundChannelTool({ bindingRepo, queue, threadId });
    const out = (await tool.call(
      { target: "all", message: "hi", importance: "info" },
      { ctx: {} as never },
    )) as { status: string };
    expect(out.status).toBe("binding_unavailable");
  });

  it("returns binding_in_progress when only binding is in 'binding' state", async () => {
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, runtimeId);
    const threadId = newId("th");
    await bindingRepo.create({
      threadId,
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "client",
    });
    const queue = createChannelOutboundJobQueue(paths, runtimeId);
    const tool = createNotifyBoundChannelTool({ bindingRepo, queue, threadId });
    const out = (await tool.call(
      { target: "all", message: "hi", importance: "info" },
      { ctx: {} as never },
    )) as { status: string };
    expect(out.status).toBe("binding_in_progress");
  });
});
