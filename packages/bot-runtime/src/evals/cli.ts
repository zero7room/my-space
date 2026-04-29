import path from "node:path";
import { runMessageGuardEval } from "./message-guard-eval.js";
import { runPlanRevisionEval } from "./plan-revision-eval.js";
import { writeEvalResult } from "./result-writer.js";
import type { EvalResult } from "./runner.js";
import { runTaskConfirmationEval } from "./task-confirmation-eval.js";

const EVALS = {
  "message-guard": runMessageGuardEval,
  "task-confirmation": runTaskConfirmationEval,
  "plan-revision": runPlanRevisionEval,
} as const;

type EvalName = keyof typeof EVALS;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const evalIdx = args.indexOf("--eval");
  const evalName = evalIdx >= 0 ? args[evalIdx + 1] : null;
  if (!evalName || !(evalName in EVALS)) {
    console.error(`usage: --eval <${Object.keys(EVALS).join("|")}>`);
    process.exit(2);
  }
  const fn = EVALS[evalName as EvalName] as () => Promise<EvalResult<unknown, unknown>>;
  const result = await fn();
  const file = await writeEvalResult({
    rootDir: path.posix.join("tests", "evals", "results"),
    evalName: evalName as EvalName,
    runAt: new Date(),
    result,
  });
  console.log(`wrote ${file}`);
  console.log(`passRate=${result.passRate.toFixed(3)} (${result.passed}/${result.total})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
