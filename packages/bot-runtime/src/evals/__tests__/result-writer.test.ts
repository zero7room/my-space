import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { writeEvalResult } from "../result-writer.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ewr-"));
});

describe("writeEvalResult", () => {
  it("writes a JSON file under <root>/<date>/<evalName>.json", async () => {
    const file = await writeEvalResult({
      rootDir: tmp,
      evalName: "message-guard",
      runAt: new Date("2026-04-29T01:00:00Z"),
      result: {
        total: 10,
        passed: 9,
        failed: [
          {
            sample: { id: "s_5", input: { text: "x" }, expected: { intent: "new_task" } },
            actual: { intent: "chat" },
            passed: false,
          },
        ],
        passRate: 0.9,
        results: [],
      },
    });
    expect(file).toMatch(/2026-04-29\/message-guard\.json$/);
    const content = JSON.parse(await readFile(file, "utf8")) as {
      evalName: string;
      total: number;
      passRate: number;
      failureSamples: Array<{ sampleId: string }>;
    };
    expect(content.evalName).toBe("message-guard");
    expect(content.total).toBe(10);
    expect(content.passRate).toBe(0.9);
    expect(content.failureSamples[0]?.sampleId).toBe("s_5");
  });
});
