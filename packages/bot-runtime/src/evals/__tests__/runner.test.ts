import { describe, expect, it } from "vitest";
import { runEval } from "../runner.js";
import type { EvalSample } from "../sample.js";

const samples: EvalSample<{ text: string }, { intent: string }>[] = [
  { id: "s_1", input: { text: "hi" }, expected: { intent: "chat" } },
  { id: "s_2", input: { text: "do x" }, expected: { intent: "new_task" } },
  { id: "s_3", input: { text: "/confirm" }, expected: { intent: "confirm_task" } },
];

describe("runEval", () => {
  it("computes pass / fail / passRate", async () => {
    const result = await runEval({
      samples,
      evaluate: async (input) => ({ intent: input.text === "do x" ? "new_task" : "chat" }),
      score: (expected, actual) => expected.intent === actual.intent,
    });
    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.sample.id).toBe("s_3");
    expect(result.passRate).toBeCloseTo(2 / 3);
  });

  it("collects evaluator errors as failures with reason", async () => {
    const result = await runEval({
      samples,
      evaluate: async (input) => {
        if (input.text === "do x") throw new Error("boom");
        return { intent: "chat" };
      },
      score: (expected, actual) => expected.intent === actual.intent,
    });
    expect(result.passed).toBeLessThan(samples.length);
    const err = result.failed.find((f) => f.sample.id === "s_2");
    expect(err?.error).toContain("boom");
  });
});
