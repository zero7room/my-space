import { z } from "zod";
import type { LlmClient, LlmResponse } from "../llm/client.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import { PlanStepSchema } from "../schema/plan.js";
import type { Plan } from "../schema/plan.js";
import type { Task } from "../schema/task.js";

const DraftJsonSchema = z.object({
  title: z.string(),
  description: z.string(),
  objective: z.string(),
  steps: z.array(PlanStepSchema),
  expectedArtifacts: z.array(z.string()).default([]),
});

export type BuildDraftInput = {
  llm: LlmClient;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  threadId: string;
  ownerUserId: string;
  sourceMessageIds: string[];
  userMessage: string;
};

export type BuildDraftOutput = {
  task: Task;
  plan: Plan;
};

const SYSTEM_PROMPT = `You are an AI employee that turns a user's request into a draft task and a draft plan.
Reply ONLY with JSON of the form:
{
  "title": string,
  "description": string,
  "objective": string,
  "steps": [{"id": string, "title": string, "status": "pending"}],
  "expectedArtifacts": [string]
}`;

export async function buildDraft(input: BuildDraftInput): Promise<BuildDraftOutput> {
  const resp: LlmResponse = await input.llm.complete({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: input.userMessage }],
    tools: [],
    temperature: 0,
    responseFormat: "json",
  });
  const data =
    resp.kind === "json"
      ? resp.data
      : resp.kind === "text"
        ? JSON.parse(resp.text)
        : (() => {
            throw new Error("draft builder requires text or json response");
          })();
  const parsed = DraftJsonSchema.parse(data);
  const task = await input.taskRepo.createDraft({
    threadId: input.threadId,
    ownerUserId: input.ownerUserId,
    title: parsed.title,
    description: parsed.description,
    sourceMessageIds: input.sourceMessageIds,
  });
  const plan = await input.planRepo.createDraftPlan({
    taskId: task.id,
    threadId: input.threadId,
    objective: parsed.objective,
    steps: parsed.steps,
    expectedArtifacts: parsed.expectedArtifacts,
  });
  return { task, plan };
}
