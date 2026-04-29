import { describe, expect, it } from "vitest";
import { runMessageGuardEval } from "../message-guard-eval.js";

describe("runMessageGuardEval (stub mode)", () => {
  it("uses stub LLM to score 100% on its own canned answers (limited to 5)", async () => {
    const result = await runMessageGuardEval({ mode: "stub", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    expect(result.passRate).toBeGreaterThan(0.9);
  });

  it("stub mode hits ≥0.95 passRate over the full 200-sample set", async () => {
    const result = await runMessageGuardEval({ mode: "stub" });
    expect(result.total).toBeGreaterThanOrEqual(180);
    expect(result.passRate).toBeGreaterThanOrEqual(0.95);
  }, 30000);
});
