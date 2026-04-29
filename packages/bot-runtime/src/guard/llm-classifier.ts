import { z } from "zod";
import type { LlmClient } from "../llm/client.js";
import { type GuardIntent, GuardIntentSchema } from "../schema/guard-decision.js";

const IntentJsonSchema = z.object({
  intent: GuardIntentSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  targetTaskId: z.string().optional(),
  targetPlanId: z.string().optional(),
});

export type ClassifyInput = {
  llm: LlmClient;
  threadStatus: string;
  pendingTaskId: string | undefined;
  pendingPlanId: string | undefined;
  messageText: string;
};

export type IntentClassification = {
  intent: GuardIntent;
  confidence: number;
  reason: string;
  targetTaskId?: string;
  targetPlanId?: string;
};

const SYSTEM = `You classify the user's most recent message into ONE of these intents:
chat, new_task, task_update, plan_update, confirm_task, confirm_plan,
progress_query, cancel_task, irrelevant.

Reply ONLY with JSON: {"intent": "...", "confidence": 0..1, "reason": "...",
"targetTaskId": "..." (optional), "targetPlanId": "..." (optional)}.`;

export async function classifyIntentWithLlm(input: ClassifyInput): Promise<IntentClassification> {
  const ctx = `thread_status=${input.threadStatus} pending_task=${input.pendingTaskId ?? "-"} pending_plan=${input.pendingPlanId ?? "-"}`;
  const resp = await input.llm.complete({
    system: SYSTEM,
    messages: [{ role: "user", content: `${ctx}\n\nmessage: ${input.messageText}` }],
    tools: [],
    temperature: 0,
    responseFormat: "json",
  });

  let parsed: unknown;
  try {
    parsed = resp.kind === "json" ? resp.data : resp.kind === "text" ? JSON.parse(resp.text) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return {
      intent: "chat" as const,
      confidence: 0.2,
      reason: "LLM response not parseable; fell back to chat",
    };
  }
  const validated = IntentJsonSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      intent: "chat" as const,
      confidence: 0.2,
      reason: `LLM JSON failed schema: ${validated.error.message}`,
    };
  }
  const result = validated.data;
  return {
    intent: result.intent,
    confidence: result.confidence,
    reason: result.reason,
    ...(result.targetTaskId && { targetTaskId: result.targetTaskId }),
    ...(result.targetPlanId && { targetPlanId: result.targetPlanId }),
  };
}
