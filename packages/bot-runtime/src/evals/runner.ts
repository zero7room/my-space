import type { EvalSample } from "./sample.js";

export type SampleResult<I, E> = {
  sample: EvalSample<I, E>;
  actual?: E;
  error?: string;
  passed: boolean;
};

export type EvalResult<I, E> = {
  total: number;
  passed: number;
  failed: SampleResult<I, E>[];
  passRate: number;
  results: SampleResult<I, E>[];
};

export type EvalInput<I, E> = {
  samples: EvalSample<I, E>[];
  evaluate: (input: I) => Promise<E>;
  score: (expected: E, actual: E) => boolean;
};

export async function runEval<I, E>(input: EvalInput<I, E>): Promise<EvalResult<I, E>> {
  const results: SampleResult<I, E>[] = [];
  for (const sample of input.samples) {
    try {
      const actual = await input.evaluate(sample.input);
      const passed = input.score(sample.expected, actual);
      results.push({ sample, ...(actual !== undefined && { actual }), passed });
    } catch (err) {
      results.push({
        sample,
        ...(err instanceof Error && { error: err.message }),
        ...(!(err instanceof Error) && { error: String(err) }),
        passed: false,
      });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed);
  return {
    total: results.length,
    passed,
    failed,
    passRate: results.length === 0 ? 0 : passed / results.length,
    results,
  };
}
