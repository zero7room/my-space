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
  "task-confirmation.jsonl",
);

const InputSchema = z.object({
  draftTaskTitle: z.string(),
  draftTaskDescription: z.string(),
  userMessage: z.string(),
});
type Input = z.infer<typeof InputSchema>;

const ExpectedSchema = z.object({
  transition: z.string(),
});
type Expected = z.infer<typeof ExpectedSchema>;

const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);

export type RunTaskConfirmationEvalInput =
  | { mode: "stub"; limit?: number }
  | { mode: "live"; apiKey: string; limit?: number };

function parseSlashCommand(msg: string): "confirm" | "cancel" | "status" | null {
  const trimmed = msg.trim();
  if (trimmed === "/confirm") return "confirm";
  if (trimmed === "/cancel") return "cancel";
  if (trimmed === "/status") return "status";
  return null;
}

export async function runTaskConfirmationEval(
  args: RunTaskConfirmationEvalInput = { mode: "stub" },
): Promise<EvalResult<Input, Expected>> {
  let samples: EvalSample<Input, Expected>[] = await loadSamples<Input, Expected>(
    SAMPLES_FILE,
    SampleSchema,
  );
  if (args.limit !== undefined) samples = samples.slice(0, args.limit);

  if (args.mode === "live") {
    throw new Error("live mode not implemented for task-confirmation in v1");
  }

  // Stub mode: build canned answers keyed by the exact last user message the
  // LLM classifier constructs (same format as message-guard-eval.ts):
  // `thread_status=${threadStatus} pending_task=${pendingTaskId ?? "-"} pending_plan=${pendingPlanId ?? "-"}\n\nmessage: ${messageText}`
  const cannedByLastUser: Record<string, { kind: "text"; text: string }> = {};
  for (const s of samples) {
    const ctx = "thread_status=waiting_confirmation pending_task=tk_pending pending_plan=-";
    const key = `${ctx}\n\nmessage: ${s.input.userMessage}`;
    cannedByLastUser[key] = {
      kind: "text",
      text: JSON.stringify({
        intent: s.expected.transition,
        confidence: 0.9,
        reason: "stub canned",
      }),
    };
  }

  const fallback = {
    kind: "text" as const,
    text: JSON.stringify({
      intent: "chat",
      confidence: 0.5,
      reason: "fallback",
    }),
  };
  const llm = createStubLlmClient(cannedByLastUser, fallback);
  const guard = createMessageGuard({ llm });

  return runEval({
    samples,
    evaluate: async (input) => {
      const slashCommand = parseSlashCommand(input.userMessage);
      const decision = await guard.classify({
        source: "lark_dm" as never,
        bound: true,
        mentionsBot: true,
        replyToBotMessage: false,
        slashCommand,
        threadStatus: "waiting_confirmation" as never,
        messageText: input.userMessage,
        pendingTaskId: "tk_pending",
        pendingPlanId: undefined,
      });
      return { transition: decision.intent };
    },
    score: (expected, actual) => expected.transition === actual.transition,
  });
}
