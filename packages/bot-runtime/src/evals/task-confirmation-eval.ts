import type { EvalResult } from "./runner.js";

export async function runTaskConfirmationEval(): Promise<
  EvalResult<{ userMessage: string }, { transition: string }>
> {
  return { total: 0, passed: 0, failed: [], passRate: 0, results: [] };
}
