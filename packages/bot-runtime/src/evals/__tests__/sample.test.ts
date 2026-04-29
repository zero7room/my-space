import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createSampleSchema, loadSamples } from "../sample.js";

let tmp: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "evs-"));
});

describe("EvalSample loader", () => {
  it("loads samples from a JSONL file with explicit schema", async () => {
    const file = path.posix.join(tmp, "samples.jsonl");
    const InputSchema = z.object({ text: z.string() });
    const ExpectedSchema = z.object({ intent: z.string() });
    const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);
    await writeFile(
      file,
      [
        JSON.stringify({ id: "s_1", input: { text: "hi" }, expected: { intent: "chat" } }),
        JSON.stringify({ id: "s_2", input: { text: "do x" }, expected: { intent: "new_task" } }),
      ].join("\n"),
    );
    const samples = await loadSamples(file, SampleSchema);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.id).toBe("s_1");
    expect(samples[1]?.expected.intent).toBe("new_task");
  });

  it("rejects malformed lines via the supplied schema", async () => {
    const file = path.posix.join(tmp, "bad.jsonl");
    const InputSchema = z.object({ text: z.string() });
    const ExpectedSchema = z.object({ intent: z.string() });
    const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);
    await writeFile(file, JSON.stringify({ id: "s_1", input: {}, expected: { intent: "chat" } }));
    await expect(loadSamples(file, SampleSchema)).rejects.toThrow();
  });

  it("returns empty array when file is missing", async () => {
    const InputSchema = z.object({ text: z.string() });
    const ExpectedSchema = z.object({ intent: z.string() });
    const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);
    const samples = await loadSamples(path.posix.join(tmp, "nope.jsonl"), SampleSchema);
    expect(samples).toEqual([]);
  });
});
