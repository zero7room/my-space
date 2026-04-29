import { afterEach, describe, expect, it } from "vitest";
import { listCriteria, recordCovered, resetForTests } from "./_harness.js";

afterEach(() => {
  resetForTests();
});

describe("Acceptance C10: same webhook event_id yields one decision", () => {
  it("registers Plan 2 idempotency test as covered-by-reference evidence", () => {
    recordCovered("C10", "tests/integration/feishu-webhook-idempotent.test.ts", true);
    const c10 = listCriteria().find((c) => c.id === "C10");
    expect(c10?.status).toBe("covered-by-reference");
    expect(c10?.evidence).toContain("tests/integration/feishu-webhook-idempotent.test.ts");
  });
});
