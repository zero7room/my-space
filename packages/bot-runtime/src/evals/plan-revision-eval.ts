import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createMessageGuard } from "../guard/message-guard.js";
import { createStubLlmClient } from "../llm/client.js";
import { type EvalResult, runEval } from "./runner.js";
import { type EvalSample, createSampleSchema, loadSamples } from "./sample.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_FILE = path.join(
  HERE,
  "..",
  "..",
  "tests",
  "evals",
  "samples",
  "plan-revision.jsonl",
);

const InputSchema = z.object({
  currentPlanObjective: z.string(),
  currentPlanSteps: z.array(z.string()),
  userMessage: z.string(),
  taskStatus: z.string(),
});
type Input = z.infer<typeof InputSchema>;

const ExpectedSchema = z.object({
  shouldRevise: z.boolean(),
});
type Expected = z.infer<typeof ExpectedSchema>;

const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);

export type RunPlanRevisionEvalInput =
  | { mode: "stub"; limit?: number }
  | { mode: "live"; apiKey: string; limit?: number };

export async function runPlanRevisionEval(
  args: RunPlanRevisionEvalInput = { mode: "stub" },
): Promise<EvalResult<Input, Expected>> {
  let samples: EvalSample<Input, Expected>[] = await loadSamples<Input, Expected>(
    SAMPLES_FILE,
    SampleSchema,
  );
  if (args.limit !== undefined) samples = samples.slice(0, args.limit);

  if (args.mode === "live") {
    throw new Error("live mode not implemented for plan-revision in v1");
  }

  // Stub mode: canned LLM answers keyed by the exact last user message content.
  // The llm-classifier sends:
  //   `thread_status=${threadStatus} pending_task=${pendingTaskId ?? "-"} pending_plan=${pendingPlanId ?? "-"}\n\nmessage: ${messageText}`
  // We use threadStatus="working", no pendingTaskId, no pendingPlanId.
  const cannedByLastUser: Record<string, { kind: "text"; text: string }> = {};
  for (const s of samples) {
    const intent = s.expected.shouldRevise ? "plan_update" : "chat";
    const ctx = "thread_status=working pending_task=- pending_plan=-";
    const key = `${ctx}\n\nmessage: ${s.input.userMessage}`;
    cannedByLastUser[key] = {
      kind: "text",
      text: JSON.stringify({
        intent,
        confidence: 0.9,
        reason: "stub canned",
      }),
    };
  }

  const fallback = {
    kind: "text" as const,
    text: JSON.stringify({ intent: "chat", confidence: 0.5, reason: "fallback" }),
  };
  const llm = createStubLlmClient(cannedByLastUser, fallback);
  const guard = createMessageGuard({ llm });

  return runEval({
    samples,
    evaluate: async (input) => {
      const decision = await guard.classify({
        source: "lark_dm" as never,
        bound: false,
        mentionsBot: true,
        replyToBotMessage: false,
        slashCommand: null,
        threadStatus: "working" as never,
        messageText: input.userMessage,
        pendingTaskId: undefined,
        pendingPlanId: undefined,
      });
      return { shouldRevise: decision.intent === "plan_update" };
    },
    score: (expected, actual) => expected.shouldRevise === actual.shouldRevise,
  });
}
