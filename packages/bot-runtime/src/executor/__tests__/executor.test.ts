import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createDispatcher } from "../../tools/dispatcher.js";
import { createWriteFileTool } from "../../tools/write-file.js";
import { createStubLlmClient } from "../../llm/client.js";
import { runExecutor } from "../executor.js";

describe("Executor agent loop", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ex-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  async function setup() {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobs = createJobQueue(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "obj",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await jobs.enqueueExecuteTask({
      taskId: t.id,
      threadId: ids.th,
      planRevisionId: p.id,
      fencingToken: 1000001,
    });
    const ws = paths.workspace("rt-1", ids.th, t.id);
    await mkdir(ws, { recursive: true });
    return { paths, taskRepo, planRepo, jobs, t };
  }

  it("runs one tool call and finishes when LLM returns text after tool_result", async () => {
    const { paths, taskRepo, planRepo, jobs, t } = await setup();
    let callsMade = 0;
    const llm = {
      async complete() {
        callsMade += 1;
        if (callsMade === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "out.txt", content: "hello" },
            id: "toolu_1",
          };
        }
        return { kind: "text" as const, text: "done" };
      },
    };
    const dispatcher = createDispatcher({
      tools: [createWriteFileTool(paths)],
      policies: [],
    });
    const result = await runExecutor({
      paths,
      runtimeId: "rt-1",
      executorId: "exec-1",
      taskRepo,
      planRepo,
      jobs,
      dispatcher,
      llm,
      systemPrompt: "you write files",
      taskId: t.id,
      maxSteps: 5,
    });
    expect(result.outcome).toBe("completed");
    const after = await taskRepo.load(t.id);
    expect(after?.status).toBe("completed");
  });

  it("yields awaiting_critical_node when dispatcher returns critical_node", async () => {
    const { paths, taskRepo, planRepo, jobs, t } = await setup();
    const llm = {
      async complete() {
        return {
          kind: "tool_call" as const,
          toolName: "write_file",
          input: { path: "out.txt", content: "x" },
          id: "toolu_1",
        };
      },
    };
    const dispatcher = createDispatcher({
      tools: [createWriteFileTool(paths)],
      policies: [
        {
          id: "p1",
          scope: "user",
          matcher: { kind: "tool", toolName: "write_file" },
          action: "require_approval",
          ownerUserId: ids.user,
          enabled: true,
          createdAt: "2026-04-28T00:00:00Z",
        },
      ],
    });
    const result = await runExecutor({
      paths,
      runtimeId: "rt-1",
      executorId: "exec-1",
      taskRepo,
      planRepo,
      jobs,
      dispatcher,
      llm,
      systemPrompt: "x",
      taskId: t.id,
      maxSteps: 5,
    });
    expect(result.outcome).toBe("awaiting_critical_node");
    const after = await taskRepo.load(t.id);
    expect(after?.status).toBe("awaiting_critical_node");
  });
});
