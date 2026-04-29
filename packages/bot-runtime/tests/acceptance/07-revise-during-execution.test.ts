import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
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
  dataRoot = await mkdtemp(path.join(tmpdir(), "acc7-"));
});

afterEach(async () => {
  if (host) {
    await host.close();
    host = null;
  }
  await rm(dataRoot, { recursive: true, force: true });
  resetForTests();
});

describe("Acceptance C7: revise during execution generates revision", () => {
  it("creates a new PlanRevision when user requests a plan update mid-execution", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-acc7"), { recursive: true });

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
          title: "do thing Y",
          description: "Build thing Y as requested",
          objective: "Deliver thing Y",
          steps: [{ id: "s1", title: "implement Y", status: "pending" }],
          expectedArtifacts: ["output.txt"],
        },
      },
    );

    // execLlm: write a file then complete so the executor finishes quickly.
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "output.txt", content: "v1 work" },
            id: "toolu_acc7_1",
          };
        }
        return { kind: "text" as const, text: "completed" };
      },
    };

    host = await createHybridHost({
      paths,
      runtimeId: "rt-acc7",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are a helpful assistant",
      maxSteps: 4,
      leaseMs: 30_000,
      channel: { adminToken: "admin", ingressPort: 0 },
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000007";
    const thread = await host.master.threadRepo.create({
      title: "Acc7",
      ownerUserId: userId,
    });

    // Step 1: ingest new_task message → guard classifies → draft created
    const draftResult = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc7-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "please do thing Y",
      at: "2026-04-29T00:00:00Z",
    });
    if (draftResult.kind !== "draft_created") throw new Error("expected draft_created");
    const taskId = draftResult.taskId;

    // Step 2: confirm → task moves to queued, job enqueued
    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-acc7-2",
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
    await mkdir(paths.workspace("rt-acc7", thread.id, taskId), { recursive: true });

    // Step 3: run execution so the task reaches active/running state with some work done
    const runResult = await host.worker.runOnce();
    expect(runResult).not.toBeNull();

    // ── C7 CORE: plan revision while task is running ──
    // Load the active plan to get its ID
    const planBefore = await host.master.planRepo.loadByTaskId(taskId);
    expect(planBefore).toBeDefined();
    const oldPlanId = planBefore!.id;
    const originalObjective = planBefore!.objective;

    // Simulate a user requesting a mid-execution change by calling
    // supersedeWithRevision directly (the plan-revision API).
    // Signature: supersedeWithRevision(planId, threadId, taskId, { reason, sourceMessageId, newPlan })
    const newRev = await host.master.planRepo.supersedeWithRevision(oldPlanId, thread.id, taskId, {
      reason: "user requested objective change mid-execution",
      sourceMessageId: "msg-acc7-3",
      newPlan: {
        objective: `REVISED: ${originalObjective}`,
        steps: [
          { id: "s1", title: "implement Y (revised)", status: "pending" },
          { id: "s2", title: "add extra step", status: "pending" },
        ],
        expectedArtifacts: ["output.txt", "summary.md"],
      },
    });

    // Assert 1: a new revision was returned with status "active"
    expect(newRev).toBeDefined();
    expect(newRev.status).toBe("active");
    expect(newRev.id).toBeTruthy();
    expect(newRev.planId).toBe(oldPlanId);
    expect(newRev.reason).toContain("mid-execution");

    // Assert 2: the live plan now reflects the revised objective
    const planAfter = await host.master.planRepo.loadByTaskId(taskId);
    expect(planAfter).toBeDefined();
    expect(planAfter!.objective).toContain("REVISED:");
    expect(planAfter!.steps).toHaveLength(2);
    expect(planAfter!.revisionIds.length).toBeGreaterThanOrEqual(2); // superseded + active

    // Assert 3: listRevisions returns both the superseded snapshot and the active revision
    const revisions = await host.master.planRepo.listRevisions(thread.id, taskId);
    expect(revisions.length).toBeGreaterThanOrEqual(2);

    const supersededRev = revisions.find((r) => r.status === "superseded");
    expect(supersededRev).toBeDefined();
    expect(supersededRev!.fullPlan.objective).toBe(originalObjective);

    const activeRev = revisions.find((r) => r.status === "active");
    expect(activeRev).toBeDefined();
    expect(activeRev!.id).toBe(newRev.id);
    expect(activeRev!.fullPlan.objective).toContain("REVISED:");

    // Assert 4: plan-revisions/ directory exists with at least 2 JSON files
    const revDir = path.join(paths.taskDir("rt-acc7", thread.id, taskId), "plan-revisions");
    const revFiles = await readdir(revDir);
    const jsonFiles = revFiles.filter((f) => f.endsWith(".json"));
    expect(jsonFiles.length).toBeGreaterThanOrEqual(2);

    recordCovered("C7", "tests/acceptance/07-revise-during-execution.test.ts");
  }, 15_000);
});
