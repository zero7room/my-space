import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { EvalResult } from "./runner.js";

export type WriteEvalResultInput<I, E> = {
  rootDir: string;
  evalName: string;
  runAt: Date;
  result: EvalResult<I, E>;
};

export async function writeEvalResult<I, E>(input: WriteEvalResultInput<I, E>): Promise<string> {
  const date = input.runAt.toISOString().slice(0, 10);
  const dir = path.posix.join(input.rootDir, date);
  await mkdir(dir, { recursive: true });
  const file = path.posix.join(dir, `${input.evalName}.json`);
  const summary = {
    evalName: input.evalName,
    runAt: input.runAt.toISOString(),
    total: input.result.total,
    passed: input.result.passed,
    passRate: input.result.passRate,
    failureSamples: input.result.failed.map((f) => ({
      sampleId: f.sample.id,
      description: f.sample.description,
      expected: f.sample.expected,
      actual: f.actual,
      error: f.error,
    })),
  };
  await writeFile(file, JSON.stringify(summary, null, 2), "utf8");
  return file;
}
