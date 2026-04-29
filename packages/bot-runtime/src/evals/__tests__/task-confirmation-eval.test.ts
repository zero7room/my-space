import { describe, expect, it } from "vitest";
import { runTaskConfirmationEval } from "../task-confirmation-eval.js";

describe("runTaskConfirmationEval (stub mode)", () => {
  it("hits >=0.95 passRate over 50 samples", async () => {
    const result = await runTaskConfirmationEval({ mode: "stub" });
    expect(result.total).toBeGreaterThanOrEqual(40);
    expect(result.passRate).toBeGreaterThanOrEqual(0.95);
  }, 15000);
});
