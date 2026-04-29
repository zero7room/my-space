import { describe, expect, it } from "vitest";
import { runMessageGuardEval } from "../message-guard-eval.js";

describe("runMessageGuardEval (stub mode)", () => {
  it("uses stub LLM to score 100% on its own canned answers (limited to 5)", async () => {
    const result = await runMessageGuardEval({ mode: "stub", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    expect(result.passRate).toBeGreaterThan(0.9);
  });
});
