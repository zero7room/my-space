import type { EvalResult } from "./runner.js";

export async function runPlanRevisionEval(): Promise<
  EvalResult<{ userMessage: string }, { shouldRevise: boolean }>
> {
  return { total: 0, passed: 0, failed: [], passRate: 0, results: [] };
}
