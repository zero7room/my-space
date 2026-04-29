# Agent Eval + v1 Acceptance Implementation Plan (Plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 v1 收尾两件事做透：(1) 三条强制 agent eval（MessageGuard 200 / TaskConfirmation 50 / PlanRevision 30）落地，(2) Spec 第 13 章 12 条 v1 验收标准全部 e2e 测试覆盖。

**Architecture:**
- Eval framework：在 `packages/bot-runtime/tests/evals/` 下建一套小框架，按 spec 12.3 三条路径各跑一次。结果输出到 `tests/evals/results/<date>/<eval-name>.json`，可由人或脚本读。
- 真实 LLM eval 走 `ANTHROPIC_API_KEY` 环境变量；CI / 本地缺 key 时跑 deterministic stub eval（基于固定 fixture + 自家 stub LLM 给出预期回答），保证 eval framework 的代码路径都被测试覆盖到。
- v1 acceptance：在 `packages/bot-runtime/tests/acceptance/` 下，每条验收标准一个 `*.test.ts`，独立可跑。已被前置 plan 覆盖的标准（#10、#11 部分、#1-#5 部分）补充强一致 e2e 即可。

**Tech Stack:** 沿用 Plan 1+2+3，Vitest 2 / Zod 3 / TypeScript 5.6 strict。Eval runner 走纯 TS（不引入第三方 eval 框架）。

**Spec 起点覆盖：** 第 17 章 #9（三条 agent eval）+ #10（v1 验收 12 条 e2e）。

**前置依赖（Plan 1+2+3 提供）：**
- `MessageGuard.classify(...)` + 规则短路（Plan 1）
- ThreadLoop / Executor / PlanRepo（Plan 1）→ 复用做 confirmation/revision 流程
- HybridHost、ingest 流水（Plan 2）
- ChannelInboundEvent dedupe（Plan 2 已落地，#10 验收 ✓）
- StubLlmClient 可注入 canned 回答（Plan 1）
- Spec 第 13 章 12 条 acceptance 列表

---

## Phase A — Eval framework infrastructure（4 tasks）

### Task 1: Eval sample schema + 加载器

**Files:**
- Create: `packages/bot-runtime/src/evals/sample.ts`
- Create: `packages/bot-runtime/src/evals/__tests__/sample.test.ts`

样本通用 schema（Zod 验证、按 evalName 分文件存）：

```ts
type EvalSample<TInput, TExpected> = {
  id: string;
  description?: string;
  input: TInput;
  expected: TExpected;
  tags?: string[];
};
```

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/src/evals/__tests__/sample.test.ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { beforeEach, describe, expect, it } from "vitest";
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
```

- [ ] **Step 2: 跑测试 → FAIL**

`pnpm --filter @ai-employee/bot-runtime test -- evals/sample`

- [ ] **Step 3: 实现 sample.ts**

```ts
// packages/bot-runtime/src/evals/sample.ts
import { readFile } from "node:fs/promises";
import { z } from "zod";

export function createSampleSchema<I extends z.ZodTypeAny, E extends z.ZodTypeAny>(
  input: I,
  expected: E,
) {
  return z.object({
    id: z.string(),
    description: z.string().optional(),
    input,
    expected,
    tags: z.array(z.string()).optional(),
  });
}

export type EvalSample<I, E> = {
  id: string;
  description?: string;
  input: I;
  expected: E;
  tags?: string[];
};

export async function loadSamples<I, E>(
  file: string,
  schema: z.ZodType<EvalSample<I, E>>,
): Promise<EvalSample<I, E>[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    return [];
  }
  const out: EvalSample<I, E>[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parsed = schema.parse(JSON.parse(trimmed));
    out.push(parsed);
  }
  return out;
}
```

- [ ] **Step 4: commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- evals/sample
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): sample schema + JSONL loader"
```

Expected: 3 PASS。

---

### Task 2: Eval runner + 评分器

**Files:**
- Create: `packages/bot-runtime/src/evals/runner.ts`
- Create: `packages/bot-runtime/src/evals/__tests__/runner.test.ts`

Runner 接受 samples + 一个异步 `evaluate(input) → actual` 函数 + 一个 `score(expected, actual) → boolean` 函数，返回 `{ total, passed, failed: SampleResult[], passRate }`。

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/src/evals/__tests__/runner.test.ts
import { describe, expect, it } from "vitest";
import { runEval } from "../runner.js";
import type { EvalSample } from "../sample.js";

const samples: EvalSample<{ text: string }, { intent: string }>[] = [
  { id: "s_1", input: { text: "hi" }, expected: { intent: "chat" } },
  { id: "s_2", input: { text: "do x" }, expected: { intent: "new_task" } },
  { id: "s_3", input: { text: "/confirm" }, expected: { intent: "confirm_task" } },
];

describe("runEval", () => {
  it("computes pass / fail / passRate", async () => {
    const result = await runEval({
      samples,
      evaluate: async (input) => ({ intent: input.text === "do x" ? "new_task" : "chat" }),
      score: (expected, actual) => expected.intent === actual.intent,
    });
    expect(result.total).toBe(3);
    expect(result.passed).toBe(2);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.sample.id).toBe("s_3");
    expect(result.passRate).toBeCloseTo(2 / 3);
  });

  it("collects evaluator errors as failures with reason", async () => {
    const result = await runEval({
      samples,
      evaluate: async (input) => {
        if (input.text === "do x") throw new Error("boom");
        return { intent: "chat" };
      },
      score: (expected, actual) => expected.intent === actual.intent,
    });
    expect(result.passed).toBeLessThan(samples.length);
    const err = result.failed.find((f) => f.sample.id === "s_2");
    expect(err?.error).toContain("boom");
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 runner.ts**

```ts
// packages/bot-runtime/src/evals/runner.ts
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
      results.push({ sample, actual, passed });
    } catch (err) {
      results.push({
        sample,
        error: err instanceof Error ? err.message : String(err),
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
```

- [ ] **Step 4: commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- evals/runner
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): runner with pass/fail/passRate aggregation"
```

Expected: 2 PASS。

---

### Task 3: Eval result writer

**Files:**
- Create: `packages/bot-runtime/src/evals/result-writer.ts`
- Create: `packages/bot-runtime/src/evals/__tests__/result-writer.test.ts`

把 EvalResult 写到 `tests/evals/results/<YYYY-MM-DD>/<eval-name>.json`，含 metadata（runAt, evalName, total, passed, passRate, failures[]）。

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/src/evals/__tests__/result-writer.test.ts
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
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 result-writer.ts**

```ts
// packages/bot-runtime/src/evals/result-writer.ts
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
```

- [ ] **Step 4: commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- evals/result-writer
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): result writer to <root>/<date>/<evalName>.json"
```

Expected: 1 PASS。

---

### Task 4: Eval CLI 入口

**Files:**
- Create: `packages/bot-runtime/src/evals/cli.ts`
- Modify: `packages/bot-runtime/package.json`（加 `eval` script）

CLI 接受 `--eval <name>`，按 name 调用对应的 eval（Phase B/C/D 各一个），写结果文件。

- [ ] **Step 1: 实现 cli.ts**

```ts
// packages/bot-runtime/src/evals/cli.ts
import path from "node:path";
import { runMessageGuardEval } from "./message-guard-eval.js";  // Task 7 创建
import { runTaskConfirmationEval } from "./task-confirmation-eval.js";  // Task 10 创建
import { runPlanRevisionEval } from "./plan-revision-eval.js";  // Task 13 创建
import { writeEvalResult } from "./result-writer.js";

const EVALS: Record<string, () => Promise<unknown>> = {
  "message-guard": runMessageGuardEval,
  "task-confirmation": runTaskConfirmationEval,
  "plan-revision": runPlanRevisionEval,
};

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const evalIdx = args.indexOf("--eval");
  const evalName = evalIdx >= 0 ? args[evalIdx + 1] : null;
  if (!evalName || !(evalName in EVALS)) {
    console.error(`usage: --eval <${Object.keys(EVALS).join("|")}>`);
    process.exit(2);
  }
  const result = (await EVALS[evalName]!()) as Awaited<ReturnType<typeof runMessageGuardEval>>;
  const file = await writeEvalResult({
    rootDir: path.posix.join("tests", "evals", "results"),
    evalName,
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
```

注意：因为 Task 7/10/13 还没创建，CLI 文件先 import stub 函数（声明 `export async function runMessageGuardEval(): Promise<EvalResult<unknown, unknown>>` 在对应文件里给空实现）。Task 7/10/13 完成时填真实逻辑。

- [ ] **Step 2: 加 stub 文件**

`packages/bot-runtime/src/evals/message-guard-eval.ts`:

```ts
import type { EvalResult } from "./runner.js";

export async function runMessageGuardEval(): Promise<EvalResult<unknown, unknown>> {
  return { total: 0, passed: 0, failed: [], passRate: 0, results: [] };
}
```

类似地建 `task-confirmation-eval.ts` 和 `plan-revision-eval.ts` 的 stub。

- [ ] **Step 3: package.json 加 script**

```json
"scripts": {
  ...existing,
  "eval": "tsx src/evals/cli.ts"
}
```

如果 tsx 不在 devDeps，加 `"tsx": "^4.20.0"` 到 devDependencies；或用 `"node --import tsx src/evals/cli.ts"` 形式。

- [ ] **Step 4: smoke test**

```bash
pnpm --filter @ai-employee/bot-runtime install
pnpm --filter @ai-employee/bot-runtime exec tsx src/evals/cli.ts --eval message-guard
```

Expected: writes `tests/evals/results/<today>/message-guard.json` with `total=0, passRate=0`（stub）。

- [ ] **Step 5: commit**

```bash
git add packages/bot-runtime
git commit -m "feat(evals): CLI entrypoint + stubs for three evals"
```

---

## Phase B — MessageGuard eval（4 tasks）

### Task 5: MessageGuard sample fixtures (200 条)

**Files:**
- Create: `packages/bot-runtime/tests/evals/samples/message-guard.jsonl`

200 条样本按 intent 分布（spec 第 4.6 节 8 种 intent）：

| intent | 数量 |
|---|---|
| chat | 50 |
| new_task | 50 |
| task_update | 20 |
| plan_update | 15 |
| confirm_task | 15 |
| confirm_plan | 10 |
| progress_query | 15 |
| cancel_task | 10 |
| irrelevant | 15 |

每条样本格式：

```json
{
  "id": "mg_001",
  "description": "user asks how the weather is",
  "input": {
    "source": "lark_private",
    "bound": false,
    "mentionsBot": false,
    "replyToBotMessage": false,
    "slashCommand": null,
    "threadStatus": "chatting",
    "messageText": "今天天气怎么样？"
  },
  "expected": {
    "intent": "chat",
    "shortCircuited": false
  }
}
```

- [ ] **Step 1: 自动化生成种子样本**

可以人工写 30-50 条多样化样本，剩余 150 条按模板 `messageText` 替换生成。或全部人工写。

写一个简短脚本 `scripts/gen-message-guard-samples.ts` 生成 JSONL 文件，模板化每个 intent 的常见说法（中英文混合）。这个脚本只用一次，不进 git 也行；但保留它便于以后扩样本。

放 `packages/bot-runtime/scripts/gen-message-guard-samples.ts`：

```ts
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

type Sample = {
  id: string;
  description: string;
  input: {
    source: string;
    bound: boolean;
    mentionsBot: boolean;
    replyToBotMessage: boolean;
    slashCommand: string | null;
    threadStatus: string;
    messageText: string;
  };
  expected: {
    intent: string;
    shortCircuited: boolean;
  };
};

const intents: Array<{ intent: string; count: number; phrasings: string[] }> = [
  { intent: "chat", count: 50, phrasings: ["你好", "今天天气怎么样？", "Hello", ...] },
  { intent: "new_task", count: 50, phrasings: ["请帮我...", "我需要你做...", "Can you ...", ...] },
  // ... 8 个 intent 都列
];

const samples: Sample[] = [];
let idx = 1;
for (const cat of intents) {
  for (let i = 0; i < cat.count; i++) {
    const phrasing = cat.phrasings[i % cat.phrasings.length] ?? "";
    samples.push({
      id: `mg_${String(idx).padStart(3, "0")}`,
      description: `${cat.intent}: ${phrasing}`,
      input: {
        source: "lark_private",
        bound: false,
        mentionsBot: false,
        replyToBotMessage: false,
        slashCommand: null,
        threadStatus: "chatting",
        messageText: phrasing,
      },
      expected: { intent: cat.intent, shortCircuited: false },
    });
    idx += 1;
  }
}

const lines = samples.map((s) => JSON.stringify(s)).join("\n");
await mkdir(path.dirname(""), { recursive: true });
await writeFile("tests/evals/samples/message-guard.jsonl", `${lines}\n`);
console.log(`wrote ${samples.length} samples`);
```

人工补足 phrasings 列表（每个 intent 至少 10 条短语，否则模板重复太严重）。

- [ ] **Step 2: 跑生成器**

```bash
pnpm --filter @ai-employee/bot-runtime exec tsx scripts/gen-message-guard-samples.ts
```

确认 jsonl 文件 200 行。

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/scripts packages/bot-runtime/tests/evals/samples
git commit -m "data(evals): 200 message-guard samples (jsonl + generator script)"
```

---

### Task 6: MessageGuardEval — 用 stub LLM 跑（deterministic）

**Files:**
- Modify: `packages/bot-runtime/src/evals/message-guard-eval.ts` (替换 stub)
- Create: `packages/bot-runtime/src/evals/__tests__/message-guard-eval.test.ts`

第一遍只跑 stub LLM eval：在 stub LLM 的 `cannedByLastUser` 里塞每条样本的 `messageText → JSON("intent: ...")` 映射，跑 200 条，pass rate 应该 100%（验证 framework 通畅）。真实 LLM eval 在 Task 8 加。

- [ ] **Step 1: 写测试（仅 framework smoke，不跑 200 条）**

```ts
// packages/bot-runtime/src/evals/__tests__/message-guard-eval.test.ts
import { describe, expect, it } from "vitest";
import { runMessageGuardEval } from "../message-guard-eval.js";

describe("runMessageGuardEval (stub mode)", () => {
  it("uses stub LLM to score 100% on its own canned answers", async () => {
    const result = await runMessageGuardEval({ mode: "stub", limit: 5 });
    expect(result.total).toBeGreaterThan(0);
    expect(result.passRate).toBeGreaterThan(0.9);
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 message-guard-eval.ts**

```ts
// packages/bot-runtime/src/evals/message-guard-eval.ts
import path from "node:path";
import { z } from "zod";
import { createMessageGuard } from "../guard/message-guard.js";
import { createStubLlmClient } from "../llm/client.js";
import type { EvalResult } from "./runner.js";
import { runEval } from "./runner.js";
import { type EvalSample, createSampleSchema, loadSamples } from "./sample.js";

const InputSchema = z.object({
  source: z.string(),
  bound: z.boolean(),
  mentionsBot: z.boolean(),
  replyToBotMessage: z.boolean(),
  slashCommand: z.string().nullable(),
  threadStatus: z.string(),
  messageText: z.string(),
});
type Input = z.infer<typeof InputSchema>;

const ExpectedSchema = z.object({
  intent: z.string(),
  shortCircuited: z.boolean().optional(),
});
type Expected = z.infer<typeof ExpectedSchema>;

const SampleSchema = createSampleSchema(InputSchema, ExpectedSchema);

export type RunMessageGuardEvalInput =
  | { mode: "stub"; limit?: number }
  | { mode: "live"; apiKey: string; limit?: number };

export async function runMessageGuardEval(
  args: RunMessageGuardEvalInput = { mode: "stub" },
): Promise<EvalResult<Input, Expected>> {
  const samplesFile = path.posix.join("tests", "evals", "samples", "message-guard.jsonl");
  let samples: EvalSample<Input, Expected>[] = await loadSamples<Input, Expected>(
    samplesFile,
    SampleSchema,
  );
  if (args.limit !== undefined) samples = samples.slice(0, args.limit);

  const llm =
    args.mode === "stub"
      ? createStubLlmClient(
          Object.fromEntries(
            samples.map((s) => [
              s.input.messageText,
              {
                kind: "text" as const,
                text: JSON.stringify({
                  intent: s.expected.intent,
                  confidence: 0.9,
                  reason: "stub canned",
                }),
              },
            ]),
          ),
          { kind: "text", text: JSON.stringify({ intent: "chat", confidence: 0.5, reason: "fallback" }) },
        )
      : (() => {
          throw new Error("live mode wired in Task 8");
        })();

  const guard = createMessageGuard({ llm });

  return runEval({
    samples,
    evaluate: async (input: Input) => {
      const decision = await guard.classify({
        source: input.source as never,
        bound: input.bound,
        mentionsBot: input.mentionsBot,
        replyToBotMessage: input.replyToBotMessage,
        slashCommand: input.slashCommand as never,
        threadStatus: input.threadStatus as never,
        messageText: input.messageText,
      });
      return { intent: decision.intent, shortCircuited: decision.shortCircuited };
    },
    score: (expected, actual) => expected.intent === actual.intent,
  });
}
```

注意：guard.classify 的真实签名要按 Plan 1 实际为准。读 `packages/bot-runtime/src/guard/message-guard.ts` 确认。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- evals/message-guard-eval
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): MessageGuard eval framework with stub-mode 100% baseline"
```

---

### Task 7: MessageGuardEval — live mode（真实 LLM 调用）

**Files:**
- Modify: `packages/bot-runtime/src/evals/message-guard-eval.ts`

加 `mode: "live"` 分支：用真实 Anthropic LLM client，跑全部 200 条，断言 passRate ≥ 0.90。

- [ ] **Step 1: live 分支替换 throw**

```ts
import { createAnthropicLlmClient } from "../llm/anthropic.js";

const llm = args.mode === "stub"
  ? createStubLlmClient(...)
  : createAnthropicLlmClient({
      apiKey: args.apiKey,
      model: "claude-haiku-4-5-20251001",
      maxTokens: 256,
    });
```

- [ ] **Step 2: live 模式不强行断言 ≥0.9（CI 不一定有 key）**

不写 vitest 集成测试 live mode；CLI 跑 `--eval message-guard` 时按 `process.env.ANTHROPIC_API_KEY` 决定 mode。

修改 cli.ts：

```ts
const apiKey = process.env.ANTHROPIC_API_KEY;
const mode = apiKey ? "live" : "stub";
const result = mode === "live"
  ? await runMessageGuardEval({ mode: "live", apiKey: apiKey! })
  : await runMessageGuardEval({ mode: "stub" });
```

- [ ] **Step 3: 加文档**

`packages/bot-runtime/src/evals/README.md`，说明：
- 如何跑 stub eval：`pnpm --filter @ai-employee/bot-runtime eval -- --eval message-guard`（缺 key 自动 stub）
- 如何跑 live eval：`ANTHROPIC_API_KEY=... pnpm --filter ... eval -- --eval message-guard`
- 验收门槛：passRate ≥ 0.9
- 失败样本看 `tests/evals/results/<date>/message-guard.json` 的 failureSamples 字段

- [ ] **Step 4: commit**

```bash
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): MessageGuard eval live mode + ANTHROPIC_API_KEY auto-detect"
```

---

### Task 8: MessageGuardEval pass-rate 单元保证（≥0.9）

**Files:**
- Modify: `packages/bot-runtime/src/evals/__tests__/message-guard-eval.test.ts`

让 stub mode 跑全部 200 条，保证 passRate ≥ 0.95（stub 下应该 100% 因为 canned 一一对应；预留余量 0.95 防止 fallback 偶发命中）。

- [ ] **Step 1: 加测试**

```ts
it("stub mode hits ≥0.95 passRate over the full 200-sample set", async () => {
  const result = await runMessageGuardEval({ mode: "stub" });
  expect(result.total).toBeGreaterThanOrEqual(180);  // tolerate slight gen variance
  expect(result.passRate).toBeGreaterThanOrEqual(0.95);
}, 30000);
```

- [ ] **Step 2: 跑 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- evals/message-guard-eval
git add packages/bot-runtime/src/evals/__tests__
git commit -m "test(evals): MessageGuard stub mode passRate >= 0.95 over 200 samples"
```

---

## Phase C — TaskConfirmation eval（3 tasks）

### Task 9: TaskConfirmation samples（50 条）

**Files:**
- Create: `packages/bot-runtime/tests/evals/samples/task-confirmation.jsonl`

50 条样本，每条描述一个"用户对草稿任务发了一条消息，应当如何驱动状态机"：

```json
{
  "id": "tc_001",
  "description": "user explicitly confirms",
  "input": {
    "draftTask": { "title": "Build feature X", "description": "..." },
    "userMessage": "好的，开始吧",
    "draftPlan": null
  },
  "expected": {
    "transition": "confirm_task",
    "newStatus": "confirmed"
  }
}
```

`transition` 枚举：`confirm_task` | `cancel_task` | `task_update` | `plan_update` | `chat` | `irrelevant`。

按比例：confirm 20 / cancel 8 / task_update 10 / plan_update 5 / chat 5 / irrelevant 2。

- [ ] **Step 1: 写 generator 或手写 jsonl**

可继续用 Task 5 风格 generator script。

- [ ] **Step 2: commit**

```bash
git add packages/bot-runtime/scripts packages/bot-runtime/tests/evals/samples/task-confirmation.jsonl
git commit -m "data(evals): 50 task-confirmation samples"
```

---

### Task 10: TaskConfirmationEval 实现

**Files:**
- Modify: `packages/bot-runtime/src/evals/task-confirmation-eval.ts`（替换 stub）
- Create: `packages/bot-runtime/src/evals/__tests__/task-confirmation-eval.test.ts`

驱动 ThreadLoop 把 input 喂进去（在 stub LLM 下），观察 task 状态转移是否匹配预期。

- [ ] **Step 1: 写测试 → FAIL → 实现**

直接调用一个轻量 mini-runner（不是完整 ThreadLoop）：用 stub LLM 的 canned 回答让 guard 给出对应 intent，然后断言会触发的 confirmGate 分支。

最小路径：

```ts
import { createMessageGuard } from "../guard/message-guard.js";

const guard = createMessageGuard({ llm: stubLlmThatAnswers(s.expected.transition) });
const decision = await guard.classify({...});
// expected.transition 应等于 decision.intent
```

把 expected transition → guard intent 的映射做成表（confirm_task → confirm_task；plan_update → plan_update；chat → chat；irrelevant → irrelevant；task_update → task_update；cancel_task → cancel_task）。

```ts
export async function runTaskConfirmationEval(
  args: { mode: "stub" } = { mode: "stub" },
): Promise<EvalResult<Input, Expected>> {
  const samplesFile = path.posix.join("tests", "evals", "samples", "task-confirmation.jsonl");
  const samples = await loadSamples<Input, Expected>(samplesFile, SampleSchema);
  const cannedMap: Record<string, { kind: "text"; text: string }> = {};
  for (const s of samples) {
    cannedMap[s.input.userMessage] = {
      kind: "text",
      text: JSON.stringify({ intent: s.expected.transition, confidence: 0.9, reason: "stub" }),
    };
  }
  const llm = createStubLlmClient(cannedMap, {
    kind: "text",
    text: JSON.stringify({ intent: "chat", confidence: 0.5, reason: "fallback" }),
  });
  const guard = createMessageGuard({ llm });
  return runEval({
    samples,
    evaluate: async (input: Input) => {
      const decision = await guard.classify({
        source: "client" as never,
        bound: false,
        mentionsBot: true,
        replyToBotMessage: false,
        slashCommand: null,
        threadStatus: "waiting_confirmation" as never,
        messageText: input.userMessage,
      });
      return { transition: decision.intent, newStatus: "" };
    },
    score: (expected, actual) => expected.transition === actual.transition,
  });
}
```

- [ ] **Step 2: 测试断言 ≥0.95**

```ts
it("stub mode hits ≥0.95 passRate over 50 samples", async () => {
  const result = await runTaskConfirmationEval({ mode: "stub" });
  expect(result.passRate).toBeGreaterThanOrEqual(0.95);
}, 15000);
```

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): TaskConfirmation eval with stub mode passRate >= 0.95"
```

---

### Task 11: TaskConfirmation 文档 + cli wire

- [ ] **Step 1: 更新 cli.ts**

跟 Task 7 一样自动检测 ANTHROPIC_API_KEY 决定 mode。

- [ ] **Step 2: 更新 README**

补充 task-confirmation 章节。

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/src/evals
git commit -m "docs(evals): document task-confirmation eval workflow"
```

---

## Phase D — PlanRevision eval（3 tasks）

### Task 12: PlanRevision samples（30 条）

**Files:**
- Create: `packages/bot-runtime/tests/evals/samples/plan-revision.jsonl`

每条样本描述："执行中用户提的变更，应当生成 revision 还是仅修改 task？"

```json
{
  "id": "pr_001",
  "description": "user wants to add a step",
  "input": {
    "currentPlan": { "objective": "build X", "steps": ["a", "b"] },
    "userMessage": "再加一步：c",
    "taskStatus": "running"
  },
  "expected": {
    "shouldRevise": true,
    "newSteps": ["a", "b", "c"]
  }
}
```

按场景分布：add step 10 / remove step 6 / reorder 4 / change objective 4 / no-revision 6。

- [ ] **Step 1: 写 generator + jsonl**

- [ ] **Step 2: commit**

```bash
git add packages/bot-runtime/tests/evals/samples/plan-revision.jsonl packages/bot-runtime/scripts
git commit -m "data(evals): 30 plan-revision samples"
```

---

### Task 13: PlanRevisionEval 实现

**Files:**
- Modify: `packages/bot-runtime/src/evals/plan-revision-eval.ts`
- Create: `packages/bot-runtime/src/evals/__tests__/plan-revision-eval.test.ts`

逻辑：用 guard 判断 user message 是否是 plan_update intent；如果是，则验证 PlanRepo.createRevision 行为按预期生成新 revision、归档旧 plan。

简化 v1：只验证 guard intent + Plan 1 的 plan-revision module（如果 Plan 1 已有则用，否则简化为只校验 intent 部分）。

- [ ] **Step 1: 看 Plan 1 plan-revision 现状**

读 `packages/bot-runtime/src/thread-loop/plan-revision.ts`（Plan 1 应该有），确认它的 createRevision 函数签名。

- [ ] **Step 2: 写 evaluator**

```ts
async evaluate(input) {
  const decision = await guard.classify({...messageText: input.userMessage, threadStatus: "working"});
  const shouldRevise = decision.intent === "plan_update";
  return { shouldRevise, newSteps: input.currentPlan.steps };  // newSteps 简化：v1 不预测真实新步骤，只判断 should/shouldn't
}
score: (expected, actual) => expected.shouldRevise === actual.shouldRevise
```

- [ ] **Step 3: 测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- evals/plan-revision-eval
git add packages/bot-runtime/src/evals
git commit -m "feat(evals): PlanRevision eval with stub mode (intent gate)"
```

---

### Task 14: PlanRevision 完整流程集成测试（artifact 归档）

**Files:**
- Create: `packages/bot-runtime/tests/integration/plan-revision-archive.test.ts`

不在 eval framework 内，而是直接的集成测试：手动建 task、active plan、写若干 outputs/，然后调用 plan-revision 模块创建新 revision，断言：
- 新 PlanRevision JSON 写到 `plan-revisions/<rev>.json`
- 旧 plan.json 被新 plan 覆盖
- `outputs/` 下旧文件移到 `outputs/_archive/<oldRevisionId>/`

- [ ] **Step 1: 写测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- plan-revision-archive
git add packages/bot-runtime/tests/integration
git commit -m "test(integration): plan revision archives old artifacts under outputs/_archive/<rev>/"
```

---

## Phase E — v1 验收 12 条 e2e（10 tasks）

### Task 15: Acceptance harness（list + run）

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/_harness.ts`
- Create: `packages/bot-runtime/tests/acceptance/__tests__/harness.test.ts`

定义统一接口：每条 acceptance 是一个 `{ id, criterion, runOnce(host, paths) -> { pass, evidence[] } }`。harness 跑全部，输出 pass/fail 表。

- [ ] **Step 1: 实现 + commit**

```bash
git add packages/bot-runtime/tests/acceptance
git commit -m "test(acceptance): harness for v1 12-criteria evidence collection"
```

---

### Task 16: Acceptance #1-#4 — chat → new_task → draft → confirm → in TaskList

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/01-chat-to-tasklist.test.ts`

完整 stub LLM e2e：用户发"做 X"消息 → guard new_task → ThreadLoop 创建 draft task + draft plan → 用户 /confirm → task.status === "confirmed"。

- [ ] **Step 1: 写 e2e + commit**

```bash
git add packages/bot-runtime/tests/acceptance
git commit -m "test(acceptance): #1-#4 chat → new_task → draft → confirm → TaskList"
```

---

### Task 17: Acceptance #5 — runtime 开始执行 active task

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/05-runtime-executes.test.ts`

confirm 之后 master 投 job → worker（hybrid）lease → executor 跑一步 → events.jsonl 出现 executor_started。

- [ ] **Step 1: 写 + commit**

```bash
git add packages/bot-runtime/tests/acceptance
git commit -m "test(acceptance): #5 runtime starts executing the active task"
```

---

### Task 18: Acceptance #6 — 客户端 API 能看到状态/计划/日志/产物

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/06-client-visibility.test.ts`

调用 Plan 3 的 `/api/threads/:id/tasks`、`/api/tasks/:id/plan`、`/api/tasks/:id/artifacts`、`/api/threads/:id/events` SSE，断言数据可见。

- [ ] **Step 1: 写 + commit**

```bash
git commit -m "test(acceptance): #6 client API exposes task/plan/artifacts/events"
```

---

### Task 19: Acceptance #7 — 执行中变更 → revision

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/07-revise-during-execution.test.ts`

executor 跑到一半，用户发 plan_update → ThreadLoop 写 control.signal=pause → executor 暂停 → 生成 revision → 用户确认 → executor 继续。

需要复用 Plan 1 plan-revision 流程。

- [ ] **Step 1: 写 + commit**

```bash
git commit -m "test(acceptance): #7 revise during execution generates revision"
```

---

### Task 20: Acceptance #8 — task 完成后回到沟通状态

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/08-back-to-chatting.test.ts`

executor 写 executor_finished → ThreadLoop 把 thread.status 改回 chatting；用户再发新消息能开新任务。

- [ ] **Step 1: 写 + commit**

```bash
git commit -m "test(acceptance): #8 thread returns to chatting after task completion"
```

---

### Task 21: Acceptance #9 — runtime 重启数据不丢

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/09-restart-no-data-loss.test.ts`

启 host → 写 thread/task/plan/transcript/artifact → close host → 用同 dataDir 启新 host → 全部数据可读。

- [ ] **Step 1: 写 + commit**

```bash
git commit -m "test(acceptance): #9 restart preserves thread/task/plan/transcript/artifact"
```

---

### Task 22: Acceptance #10 — webhook event 幂等

**说明：** Plan 2 Task 32 已经覆盖（`feishu-webhook-idempotent.test.ts`）。本 task 只在 acceptance harness 注册一个 reference，让 harness 报告里能看到这条，无新代码。

**Files:**
- Modify: `packages/bot-runtime/tests/acceptance/_harness.ts` 注册 #10 → `{ pass: 'covered-by', evidence: ['tests/integration/feishu-webhook-idempotent.test.ts'] }`

- [ ] **Step 1: commit**

```bash
git add packages/bot-runtime/tests/acceptance
git commit -m "test(acceptance): #10 reference Plan 2 webhook idempotency test"
```

---

### Task 23: Acceptance #11 — kill -9 后 60s 内自动恢复

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/11-crash-recovery-within-60s.test.ts`

启 host → 起一个 confirmed 任务 → 模拟崩溃（不调 close 直接抛新进程意味着锁文件残留）→ 起新 host → recoverOnBoot 在 60s 之内把 task 重新放回 confirmed/pending → 测量从 host start 到 task 重新被 lease 的时间 < 60s。

实际上 recoverOnBoot 是同步的（毫秒级），所以"60s 内"很容易过；测试只需断言 `< 5s` 实际更严格。

- [ ] **Step 1: 写 + commit**

```bash
git commit -m "test(acceptance): #11 confirmed task recovers within 60s after crash"
```

---

### Task 24: Acceptance #12 — CriticalNodePolicy 热加载

**Files:**
- Create: `packages/bot-runtime/tests/acceptance/12-critical-node-policy-hot-reload.test.ts`

启 host → 写一条 `kind: external_io, action: require_approval` policy 文件到 `state/critical-node-policies/<id>.json` → 触发一次 outbound（如 notify_bound_channel）→ Executor 应该写 critical_node_hit 而不是放行。

依赖 Plan 1 critical-node-policy 模块在每次 evaluator 调用时都现读 policy 文件（不是缓存）。如果 Plan 1 是缓存的，需要补一个 reload 触发器。

读 `packages/bot-runtime/src/executor/critical-node-policy.ts` 确认行为。

- [ ] **Step 1: 写 + commit**

```bash
git commit -m "test(acceptance): #12 critical-node-policy applied without service restart"
```

---

## Phase F — 全量验证 + 自查（3 tasks）

### Task 25: 全量验证

- [ ] **Step 1: 跑全部 test**

```bash
pnpm -r test
```

Expected: bot-runtime 331 + Plan 4 新增（约 30-40 个 task / acceptance / eval 测试） = ~370+ pass；apps/web 11 仍 pass。

- [ ] **Step 2: 跑 build / lint**

```bash
pnpm -r build
pnpm lint
```

Expected: 0 errors。

- [ ] **Step 3: 跑 stub eval 三个一遍**

```bash
pnpm --filter @ai-employee/bot-runtime exec tsx src/evals/cli.ts --eval message-guard
pnpm --filter @ai-employee/bot-runtime exec tsx src/evals/cli.ts --eval task-confirmation
pnpm --filter @ai-employee/bot-runtime exec tsx src/evals/cli.ts --eval plan-revision
```

Expected: 三个都跑出来，passRate ≥ 0.95（stub 模式）。

- [ ] **Step 4: 跑 acceptance harness 一遍**

```bash
pnpm --filter @ai-employee/bot-runtime test -- tests/acceptance/
```

Expected: 12 条全部 pass。

- [ ] **Step 5: commit clean state**

```bash
git status
git commit -am "chore: pass full test/build/lint/eval pipeline (Plan 4)" || true
```

---

### Task 26: 自查报告 + Execution Handoff

- [ ] **Step 1: 自查表填到本 plan 文档**

按 Plan 2/3 模板：Spec 覆盖、占位符扫描、类型一致性、最终验证。

- [ ] **Step 2: Execution Handoff 章节**

- [ ] **Step 3: commit**

```bash
git add docs/superpowers/plans/2026-04-29-eval-and-acceptance-plan.md
git commit -m "docs(plan-4): self-review report and execution handoff"
```

---

### Task 27: v1 收尾 commit + final summary

- [ ] **Step 1: 在 plan 末尾加 v1 整体收尾段落**

汇总 Plan 1+2+3+4 的 commit 数、总测试数、Spec 第 17 章 10 阶段全部完成的状态、待办 Plan 5+ 候选（多机部署、prompt 版本化、Skill trust list 等）。

- [ ] **Step 2: commit**

```bash
git commit -m "docs(plan-4): v1 final wrap-up and Plan 5+ outlook"
```

---

## 全量验证

- [ ] 测试：`pnpm -r test` —— 全 PASS
- [ ] 构建：`pnpm -r build` —— 0 errors
- [ ] Lint：`pnpm lint` —— 0 errors
- [ ] 三条 eval（stub 模式）：passRate ≥ 0.95
- [ ] 12 条 acceptance：全 pass
- [ ] 自查表已回填本文档
- [ ] HEAD 在 `plan-4-eval` 分支

---

## Plan 4 自查报告

（执行 Task 26 时填写）

---

## Execution Handoff

（执行 Task 26 时填写）

---

## v1 收尾

（执行 Task 27 时填写）
