import type { LlmClient, LlmMessage, LlmToolDef } from "../llm/client.js";
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import type { Dispatcher } from "../tools/dispatcher.js";
import type { ToolContext } from "../tools/tool.js";
import { readControl } from "./control-watcher.js";
import { createEventsWriter } from "./events-writer.js";

export type RunExecutorInput = {
  paths: Paths;
  runtimeId: string;
  executorId: string;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  llm: LlmClient;
  systemPrompt: string;
  taskId: string;
  maxSteps: number;
};

export type RunExecutorResult =
  | { outcome: "completed"; summary: string }
  | { outcome: "failed"; error: string }
  | { outcome: "cancelled" }
  | { outcome: "awaiting_critical_node"; policyIds: string[] }
  | { outcome: "blocked"; reason: string };

export async function runExecutor(
  input: RunExecutorInput,
): Promise<RunExecutorResult> {
  const task = await input.taskRepo.load(input.taskId);
  if (!task) throw new Error(`task ${input.taskId} not found`);
  if (task.status !== "queued" && task.status !== "running") {
    return { outcome: "blocked", reason: `unexpected status ${task.status}` };
  }
  const plan = await input.planRepo.loadPlan(task.threadId, task.id);
  if (!plan) throw new Error(`plan not found for task ${input.taskId}`);

  if (task.status === "queued") {
    await input.taskRepo.transitionStatus(input.taskId, "running");
  }
  const fencingToken = 1; // master-issued via job; passed via dispatcher ctx
  const writer = createEventsWriter(
    input.paths,
    input.runtimeId,
    task.threadId,
    task.id,
  );
  await writer.write({
    kind: "executor_started",
    executorId: input.executorId,
    fencingToken,
    at: new Date().toISOString(),
  });

  const ctx: ToolContext = {
    runtimeId: input.runtimeId,
    threadId: task.threadId,
    taskId: task.id,
    fencingToken,
    now: () => new Date().toISOString(),
  };

  const messages: LlmMessage[] = [];
  messages.push({
    role: "user",
    content: `Task: ${task.title}\n\n${task.description}\n\nObjective: ${plan.objective}`,
  });

  const tools: LlmToolDef[] = [];
  let lastSeenSignal = 0;

  for (let step = 0; step < input.maxSteps; step++) {
    const ctl = await readControl(
      input.paths,
      input.runtimeId,
      task.threadId,
      task.id,
      { lastSeen: lastSeenSignal },
    );
    if (ctl?.signal === "cancel") {
      await writer.write({
        kind: "executor_finished",
        outcome: "cancelled",
        at: new Date().toISOString(),
      });
      await input.taskRepo.transitionStatus(input.taskId, "cancelled").catch(() => undefined);
      return { outcome: "cancelled" };
    }
    if (ctl?.signal === "pause") {
      await writer.write({
        kind: "executor_paused",
        reason: "control:pause",
        at: new Date().toISOString(),
      });
      lastSeenSignal = ctl.signalFencingToken;
      return { outcome: "blocked", reason: "paused by control" };
    }
    if (ctl) lastSeenSignal = ctl.signalFencingToken;

    const resp = await input.llm.complete({
      system: input.systemPrompt,
      messages,
      tools,
    });
    if (resp.kind === "text") {
      await writer.write({
        kind: "executor_finished",
        outcome: "completed",
        summaryRef: resp.text,
        at: new Date().toISOString(),
      });
      await input.taskRepo.transitionStatus(input.taskId, "completed");
      return { outcome: "completed", summary: resp.text };
    }
    if (resp.kind === "json") {
      messages.push({
        role: "assistant",
        content: JSON.stringify(resp.data),
      });
      continue;
    }

    await writer.write({
      kind: "tool_call",
      toolName: resp.toolName,
      argsRef: JSON.stringify(resp.input),
      at: new Date().toISOString(),
    });
    const result = await input.dispatcher.dispatch({
      toolName: resp.toolName,
      input: resp.input,
      ctx,
    });
    if (result.outcome === "ok") {
      await writer.write({
        kind: "tool_result",
        toolName: resp.toolName,
        resultRef: JSON.stringify(result.output),
        at: new Date().toISOString(),
      });
      messages.push({
        role: "user",
        content: `tool ${resp.toolName} result: ${JSON.stringify(result.output)}`,
      });
      continue;
    }
    if (result.outcome === "critical_node") {
      for (const d of result.decisions) {
        await writer.write({
          kind: "critical_node_hit",
          policyId: d.policyId,
          action: d.action,
          at: new Date().toISOString(),
        });
      }
      await input.taskRepo.transitionStatus(input.taskId, "awaiting_critical_node");
      return {
        outcome: "awaiting_critical_node",
        policyIds: result.decisions.map((d) => d.policyId),
      };
    }
    if (result.outcome === "blocked") {
      await input.taskRepo.transitionStatus(input.taskId, "blocked");
      return { outcome: "blocked", reason: "policy:block" };
    }
    if (result.outcome === "unknown_tool") {
      messages.push({
        role: "user",
        content: `tool ${resp.toolName} is not registered. Ignore and try another approach or finish.`,
      });
      continue;
    }
    if (result.outcome === "error") {
      await writer.write({
        kind: "executor_finished",
        outcome: "failed",
        error: result.error,
        at: new Date().toISOString(),
      });
      await input.taskRepo.transitionStatus(input.taskId, "failed");
      return { outcome: "failed", error: result.error };
    }
  }

  await writer.write({
    kind: "executor_finished",
    outcome: "failed",
    error: "max_steps_exceeded",
    at: new Date().toISOString(),
  });
  await input.taskRepo.transitionStatus(input.taskId, "failed");
  return { outcome: "failed", error: "max_steps_exceeded" };
}

void newId;
