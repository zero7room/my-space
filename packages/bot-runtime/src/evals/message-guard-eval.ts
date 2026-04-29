import type { EvalResult } from "./runner.js";

export async function runMessageGuardEval(): Promise<
  EvalResult<{ messageText: string }, { intent: string }>
> {
  return { total: 0, passed: 0, failed: [], passRate: 0, results: [] };
}
