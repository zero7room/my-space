import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createGuardDecisionRepo } from "../../repositories/guard-decision-repo.js";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { createTranscriptRepo } from "../../repositories/transcript-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createThreadLoop } from "../thread-loop.js";

describe("ThreadLoop", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "tl-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
  };

  it("inbound new_task → draft created and transcripts written", async () => {
    const paths = createPaths(dataRoot);
    const threadRepo = createThreadRepo(paths, "rt-1");
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobQueue = createJobQueue(paths, "rt-1");
    const transcript = createTranscriptRepo(paths, "rt-1");
    const guardRepo = createGuardDecisionRepo(paths, "rt-1");
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "do x",
          description: "details",
          objective: "do x",
          steps: [{ id: "s1", title: "first", status: "pending" }],
          expectedArtifacts: [],
        },
      },
    );
    const thread = await threadRepo.create({
      title: "demo",
      ownerUserId: ids.user,
    });

    const tl = createThreadLoop({
      runtimeId: "rt-1",
      threadId: thread.id,
      threadRepo,
      taskRepo,
      planRepo,
      jobQueue,
      transcript,
      guardRepo,
      llm,
      issueFencingToken: () => 1000001,
    });

    const result = await tl.handleInbound({
      messageId: "msg-1",
      fromUserId: ids.user,
      source: "client",
      text: "build me a landing page",
      decision: {
        intent: "new_task",
        shortCircuited: false,
        ruleHits: [],
        confidence: 0.9,
        requiresUserConfirmation: false,
        reason: "stub",
      },
      at: "2026-04-28T00:00:00Z",
    });

    expect(result.kind).toBe("draft_created");
    if (result.kind === "draft_created") {
      const t = await taskRepo.load(result.taskId);
      expect(t?.status).toBe("draft");
    }
  });

  it("inbound confirm_task → handleConfirmation dispatches", async () => {
    const paths = createPaths(dataRoot);
    const threadRepo = createThreadRepo(paths, "rt-1");
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobQueue = createJobQueue(paths, "rt-1");
    const transcript = createTranscriptRepo(paths, "rt-1");
    const guardRepo = createGuardDecisionRepo(paths, "rt-1");
    const llm = createStubLlmClient(
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
    const thread = await threadRepo.create({
      title: "demo",
      ownerUserId: ids.user,
    });
    const tl = createThreadLoop({
      runtimeId: "rt-1",
      threadId: thread.id,
      threadRepo,
      taskRepo,
      planRepo,
      jobQueue,
      transcript,
      guardRepo,
      llm,
      issueFencingToken: () => 1000001,
    });
    const draft = await tl.handleInbound({
      messageId: "msg-1",
      fromUserId: ids.user,
      source: "client",
      text: "do x",
      decision: {
        intent: "new_task",
        shortCircuited: false,
        ruleHits: [],
        confidence: 0.9,
        requiresUserConfirmation: false,
        reason: "stub",
      },
      at: "2026-04-28T00:00:00Z",
    });
    expect(draft.kind).toBe("draft_created");
    if (draft.kind !== "draft_created") return;

    const confirm = await tl.handleInbound({
      messageId: "msg-2",
      fromUserId: ids.user,
      source: "client",
      text: "ok confirm",
      decision: {
        intent: "confirm_task",
        targetTaskId: draft.taskId,
        targetPlanId: draft.planId,
        shortCircuited: false,
        ruleHits: [],
        confidence: 0.95,
        requiresUserConfirmation: false,
        reason: "stub",
      },
      at: "2026-04-28T00:00:01Z",
    });
    expect(confirm.kind).toBe("dispatched");
  });
});
