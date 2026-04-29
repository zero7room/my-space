import { afterEach, describe, expect, it } from "vitest";
import { listCriteria, recordCovered, resetForTests } from "../_harness.js";

afterEach(() => {
  resetForTests();
});

describe("v1 acceptance harness", () => {
  it("starts with all 12 criteria pending and zero evidence", () => {
    const list = listCriteria();
    expect(list).toHaveLength(12);
    expect(list.every((c) => c.status === "pending")).toBe(true);
    expect(list.every((c) => c.evidence.length === 0)).toBe(true);
  });

  it("recordCovered marks the criterion covered and adds evidence", () => {
    recordCovered("C5", "tests/acceptance/05-runtime-executes.test.ts");
    const list = listCriteria();
    const c5 = list.find((c) => c.id === "C5");
    expect(c5?.status).toBe("covered");
    expect(c5?.evidence).toContain("tests/acceptance/05-runtime-executes.test.ts");
  });

  it("recordCovered with byReference=true uses 'covered-by-reference' status", () => {
    recordCovered("C10", "tests/integration/feishu-webhook-idempotent.test.ts", true);
    const list = listCriteria();
    const c10 = list.find((c) => c.id === "C10");
    expect(c10?.status).toBe("covered-by-reference");
  });

  it("recordCovered for unknown id throws", () => {
    expect(() => recordCovered("C99" as never, "x")).toThrow(/unknown criterion/);
  });

  it("dedupes evidence on repeated calls", () => {
    recordCovered("C1", "evidence-1");
    recordCovered("C1", "evidence-1");
    const c1 = listCriteria().find((c) => c.id === "C1");
    expect(c1?.evidence).toEqual(["evidence-1"]);
  });
});
