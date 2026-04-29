import path from "node:path";
import { runMessageGuardEval } from "./message-guard-eval.js";
import { runPlanRevisionEval } from "./plan-revision-eval.js";
import { writeEvalResult } from "./result-writer.js";
import type { EvalResult } from "./runner.js";
import { runTaskConfirmationEval } from "./task-confirmation-eval.js";

type EvalName = "message-guard" | "task-confirmation" | "plan-revision";

const apiKey = process.env.ANTHROPIC_API_KEY;

async function runWithAuto(name: string): Promise<EvalResult<unknown, unknown>> {
  if (name === "message-guard") {
    return apiKey
      ? runMessageGuardEval({ mode: "live", apiKey })
      : runMessageGuardEval({ mode: "stub" });
  }
  // task-confirmation and plan-revision still go through stubs (Tasks 10, 13 wire those)
  if (name === "task-confirmation") return runTaskConfirmationEval();
  if (name === "plan-revision") return runPlanRevisionEval();
  throw new Error(`unknown eval ${name}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const evalIdx = args.indexOf("--eval");
  const evalName = evalIdx >= 0 ? args[evalIdx + 1] : null;
  if (!evalName || !["message-guard", "task-confirmation", "plan-revision"].includes(evalName)) {
    console.error("usage: --eval <message-guard|task-confirmation|plan-revision>");
    process.exit(2);
  }
  const result = await runWithAuto(evalName);
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
