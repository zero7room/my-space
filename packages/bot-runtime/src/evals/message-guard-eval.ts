import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createMessageGuard } from "../guard/message-guard.js";
import { createStubLlmClient } from "../llm/client.js";
import { type EvalResult, runEval } from "./runner.js";
import { type EvalSample, createSampleSchema, loadSamples } from "./sample.js";

const InputSchema = z.object({
  source: z.string(),
  bound: z.boolean(),
  mentionsBot: z.boolean(),
  replyToBotMessage: z.boolean(),
  slashCommand: z.string().nullable(),
  threadStatus: z.string(),
  messageText: z.string(),
});
type Input = z.infer<typeof InputSchema>;

const ExpectedSchema = z.object({
  intent: z.string(),
  shortCircuited: z.boolean().optional(),
});
type Expected = z.infer<typeof ExpectedSchema>;

const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);

export type RunMessageGuardEvalInput =
  | { mode: "stub"; limit?: number }
  | { mode: "live"; apiKey: string; limit?: number };

const HERE = path.dirname(fileURLToPath(import.meta.url));
// src/evals/ -> go up 2 levels to package root: src/evals -> src -> bot-runtime/
const SAMPLES_FILE = path.join(
  HERE,
  "..",
  "..",
  "tests",
  "evals",
  "samples",
  "message-guard.jsonl",
);

export async function runMessageGuardEval(
  args: RunMessageGuardEvalInput = { mode: "stub" },
): Promise<EvalResult<Input, Expected>> {
  let samples: EvalSample<Input, Expected>[] = await loadSamples<Input, Expected>(
    SAMPLES_FILE,
    SampleSchema,
  );
  if (args.limit !== undefined) samples = samples.slice(0, args.limit);

  if (args.mode === "live") {
    throw new Error("live mode not implemented yet (Task 7 wires it)");
  }

  // Stub mode: canned LLM answers keyed by the exact last user message content
  // The llm-classifier sends: `${ctx}\n\nmessage: ${messageText}` as the user message
  const cannedByLastUser: Record<string, { kind: "text"; text: string }> = {};
  for (const s of samples) {
    const ctx = `thread_status=${s.input.threadStatus} pending_task=- pending_plan=-`;
    const key = `${ctx}\n\nmessage: ${s.input.messageText}`;
    cannedByLastUser[key] = {
      kind: "text",
      text: JSON.stringify({
        intent: s.expected.intent,
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
        source: input.source as never,
        bound: input.bound,
        mentionsBot: input.mentionsBot,
        replyToBotMessage: input.replyToBotMessage,
        slashCommand: input.slashCommand as never,
        threadStatus: input.threadStatus as never,
        messageText: input.messageText,
        pendingTaskId: undefined,
        pendingPlanId: undefined,
      });
      return { intent: decision.intent, shortCircuited: decision.shortCircuited };
    },
    score: (expected, actual) => expected.intent === actual.intent,
  });
}
