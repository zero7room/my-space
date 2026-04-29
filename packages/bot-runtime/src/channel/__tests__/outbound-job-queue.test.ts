import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelOutboundJobQueue } from "../outbound-job-queue.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "coq-"));
});

describe("ChannelOutboundJobQueue", () => {
  it("enqueues a send_message job and assigns id + runAfter", async () => {
    const q = createChannelOutboundJobQueue(createPaths(tmp), runtimeId);
    const job = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    expect(job.id).toMatch(/^cj_/);
    expect(job.type).toBe("send_message");
    expect(job.status).toBe("pending");
  });

  it("enqueueSendMessage with dedupeKey skips duplicates", async () => {
    const q = createChannelOutboundJobQueue(createPaths(tmp), runtimeId);
    const a = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
      dedupeKey: "k1",
    });
    const b = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
      dedupeKey: "k1",
    });
    expect(b.id).toBe(a.id);
  });

  it("listPending returns only pending channel jobs", async () => {
    const q = createChannelOutboundJobQueue(createPaths(tmp), runtimeId);
    await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "a", importance: "info" },
    });
    const pending = await q.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe("send_message");
  });
});
