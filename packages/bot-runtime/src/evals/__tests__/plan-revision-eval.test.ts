import { describe, expect, it } from "vitest";
import { runPlanRevisionEval } from "../plan-revision-eval.js";

describe("runPlanRevisionEval (stub mode)", () => {
  it("hits >=0.95 passRate over 30 samples", async () => {
    const result = await runPlanRevisionEval({ mode: "stub" });
    expect(result.total).toBeGreaterThanOrEqual(28);
    expect(result.passRate).toBeGreaterThanOrEqual(0.95);
  }, 15000);
});
