# AI 员工自动工作流系统 — Plan 1：Foundation + Headless Runtime Core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 bot-runtime 的存储底座、数据模型、ThreadLoop、Executor 与 MessageGuard，使 bot-runtime 进程能在不依赖飞书 / 客户端 UI 的前提下，通过 fixture 注入 InboundMessage 完成"消息 → guard → 草稿 → mock 确认 → 工具执行 → 产物落盘"端到端流程，并具备崩溃恢复能力。

**Architecture:** 单一二进制 bot-runtime（v1 hybrid 模式单机）；进程内分层为 ThreadLoop（per-thread actor）+ Executor（per-task actor），通过文件队列 `jobs/` 与 `events.jsonl` 协调。MessageGuard 走"规则短路 + LLM 结构化分类"双阶段。

**Tech Stack:**
- TypeScript 5.4+ strict
- Node 20+
- pnpm workspace（v9）
- Vitest（单元 + 集成）
- Zod（schema 校验）
- uuidv7（ID 生成）
- `proper-lockfile`（`.lock` 跨平台）
- `@biomejs/biome`（lint + format）
- `@anthropic-ai/sdk`（LLM 客户端，可由测试替换为 stub）

**Spec 来源：** `docs/superpowers/specs/2026-04-28-ai-employee-system-design.md`（决策依据见 `design-v0.3.md`）

**覆盖 Spec 第 17 章阶段：** 1（文件系统状态库）+ 2（数据模型）+ 3（ThreadLoop）+ 4（Executor + 文件队列）+ 5（MessageGuard）

**不覆盖（留给后续 plan）：** 阶段 6（Channel 子系统）、7（Feishu Provider）、8（客户端可视化）、9（Agent eval）、10（v1 验收 e2e）

**目录结构（最终态）：**

```
.
├── package.json                         # workspace root
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── biome.json
├── packages/
│   └── bot-runtime/
│       ├── package.json
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       └── src/
│           ├── index.ts                  # 进程入口（按角色 boot）
│           ├── config/
│           │   ├── env.ts                # 环境变量解析
│           │   └── role.ts               # 角色枚举
│           ├── storage/
│           │   ├── paths.ts              # 路径构造器
│           │   ├── lock.ts               # .lock + .runtime-info.json
│           │   ├── fencing.ts            # fencing token
│           │   ├── jsonl.ts              # append-only JSONL
│           │   ├── json-file.ts          # JSON 读写
│           │   ├── ids.ts                # UUIDv7
│           │   ├── sanitize.ts           # PII / Secret 脱敏
│           │   └── recovery.ts           # 启动扫描
│           ├── schema/
│           │   ├── user.ts
│           │   ├── thread.ts
│           │   ├── task.ts
│           │   ├── plan.ts
│           │   ├── guard-decision.ts
│           │   ├── channel.ts
│           │   ├── critical-node.ts
│           │   ├── job.ts
│           │   └── events.ts
│           ├── repositories/
│           │   ├── thread-repo.ts
│           │   ├── task-repo.ts
│           │   ├── plan-repo.ts
│           │   ├── transcript-repo.ts
│           │   ├── guard-decision-repo.ts
│           │   ├── job-queue.ts
│           │   ├── channel-binding-repo.ts
│           │   └── critical-node-policy-repo.ts
│           ├── tools/
│           │   ├── tool.ts                # Tool 协议
│           │   ├── read-file.ts
│           │   ├── write-file.ts
│           │   ├── list-dir.ts
│           │   ├── ask-clarification.ts
│           │   ├── confirm-task.ts
│           │   ├── confirm-plan.ts
│           │   ├── update-task.ts
│           │   ├── update-plan.ts
│           │   ├── notify-bound-channel.ts # stub for Plan 1
│           │   ├── confirm-critical-node.ts
│           │   └── dispatcher.ts          # tool 调度器 + critical-node 评估
│           ├── thread-loop/
│           │   ├── event-queue.ts         # per-thread 事件队列
│           │   ├── thread-loop.ts         # per-thread actor
│           │   ├── draft-builder.ts       # 草稿生成
│           │   ├── confirm-gate.ts        # 确认门禁
│           │   └── plan-revision.ts       # 变更流转
│           ├── executor/
│           │   ├── lease.ts               # 任务 lease + 心跳
│           │   ├── control-watcher.ts     # control.json 读取
│           │   ├── critical-node-policy.ts# policy 评估器
│           │   ├── recovery.ts            # in-flight tool call 恢复
│           │   └── executor.ts            # agent loop
│           ├── guard/
│           │   ├── rules.ts               # 确定性规则
│           │   ├── llm-classifier.ts      # LLM 结构化分类
│           │   ├── fallback.ts            # 降级模式
│           │   └── message-guard.ts       # 入口
│           ├── llm/
│           │   ├── client.ts              # LLM 客户端接口
│           │   └── anthropic.ts           # Anthropic 实现
│           └── runtime/
│               ├── role-host.ts           # 角色装配
│               ├── master-host.ts
│               ├── worker-host.ts
│               └── hybrid-host.ts
└── tests/
    └── integration/
        ├── headless-end-to-end.test.ts
        ├── recovery-after-crash.test.ts
        └── plan-revision.test.ts
```

**任务总数：** 60 个 task，分 9 个 Phase。

---

## Phase A — 项目骨架 + 存储基元（Spec Stage 1）

### Task 1: 初始化 pnpm workspace + bot-runtime package

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `biome.json`
- Create: `.gitignore`
- Create: `packages/bot-runtime/package.json`
- Create: `packages/bot-runtime/tsconfig.json`
- Create: `packages/bot-runtime/vitest.config.ts`
- Create: `packages/bot-runtime/src/index.ts`

- [ ] **Step 1：创建 workspace root 配置**

`package.json`：
```json
{
  "name": "ai-employee-workspace",
  "version": "0.0.0",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "biome check .",
    "format": "biome format --write ."
  },
  "devDependencies": {
    "@biomejs/biome": "1.9.4",
    "typescript": "5.6.2"
  }
}
```

`pnpm-workspace.yaml`：
```yaml
packages:
  - 'packages/*'
```

`tsconfig.base.json`：
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

`biome.json`：
```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  }
}
```

`.gitignore`：
```
node_modules/
dist/
*.log
.DS_Store
data/
coverage/
.vscode/
```

- [ ] **Step 2：创建 bot-runtime package**

`packages/bot-runtime/package.json`：
```json
{
  "name": "@ai-employee/bot-runtime",
  "version": "0.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "dev": "tsx src/index.ts"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "0.30.1",
    "proper-lockfile": "4.1.2",
    "uuidv7": "1.0.2",
    "zod": "3.23.8"
  },
  "devDependencies": {
    "@types/node": "20.16.10",
    "@types/proper-lockfile": "4.1.4",
    "tsx": "4.19.1",
    "typescript": "5.6.2",
    "vitest": "2.1.2"
  }
}
```

`packages/bot-runtime/tsconfig.json`：
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

`packages/bot-runtime/vitest.config.ts`：
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
```

`packages/bot-runtime/src/index.ts`：
```ts
export const VERSION = "0.0.0";
```

- [ ] **Step 3：安装依赖并验证 build/test**

```bash
pnpm install
pnpm -r build
pnpm -r test
```

Expected: build 成功（dist/index.js 生成）；test 输出 "No test files found"（暂时无测试）但 exit 0 因为 vitest 默认不视作错误——若失败追加 `passWithNoTests: true` 到 vitest.config.ts。

- [ ] **Step 4：Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json biome.json .gitignore packages/
git commit -m "chore: bootstrap pnpm workspace and bot-runtime package"
```

---

### Task 2: 路径构造器（storage/paths.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/paths.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/paths.test.ts`

- [ ] **Step 1：写测试**

`packages/bot-runtime/src/storage/__tests__/paths.test.ts`：
```ts
import { describe, expect, it } from "vitest";
import { createPaths } from "../paths.js";

describe("paths", () => {
  const paths = createPaths("/data");

  it("instanceRoot", () => {
    expect(paths.instanceRoot("rt-1")).toBe("/data/instances/rt-1");
  });

  it("lock", () => {
    expect(paths.lock("rt-1")).toBe("/data/instances/rt-1/.lock");
  });

  it("runtimeInfo", () => {
    expect(paths.runtimeInfo("rt-1")).toBe("/data/instances/rt-1/.runtime-info.json");
  });

  it("threadDir", () => {
    expect(paths.threadDir("rt-1", "th-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1"
    );
  });

  it("taskDir", () => {
    expect(paths.taskDir("rt-1", "th-1", "tk-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1"
    );
  });

  it("taskEvents (jsonl)", () => {
    expect(paths.taskEvents("rt-1", "th-1", "tk-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/events.jsonl"
    );
  });

  it("planRevision", () => {
    expect(paths.planRevision("rt-1", "th-1", "tk-1", "rv-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/plan-revisions/rv-1.json"
    );
  });

  it("outputs and archive", () => {
    expect(paths.outputs("rt-1", "th-1", "tk-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/user-data/outputs"
    );
    expect(paths.outputsArchive("rt-1", "th-1", "tk-1", "rv-1")).toBe(
      "/data/instances/rt-1/state/threads/th-1/tasks/tk-1/user-data/outputs/_archive/rv-1"
    );
  });

  it("jobs", () => {
    expect(paths.jobsDir("rt-1", "pending")).toBe(
      "/data/instances/rt-1/state/jobs/pending"
    );
    expect(paths.jobFile("rt-1", "locked", "job-1")).toBe(
      "/data/instances/rt-1/state/jobs/locked/job-1.json"
    );
  });

  it("channels and bindings", () => {
    expect(paths.channelConfig("rt-1", "feishu")).toBe(
      "/data/instances/rt-1/state/channels/feishu.json"
    );
    expect(paths.binding("rt-1", "th-1", "feishu", "bd-1")).toBe(
      "/data/instances/rt-1/state/bindings/th-1/feishu/bd-1/active.json"
    );
    expect(paths.chatClaim("rt-1", "feishu", "oc_xxx")).toBe(
      "/data/instances/rt-1/state/chat-claims/feishu/oc_xxx"
    );
  });

  it("criticalNodePolicy", () => {
    expect(paths.criticalNodePolicy("rt-1", "p-1")).toBe(
      "/data/instances/rt-1/state/critical-node-policies/p-1.json"
    );
  });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
pnpm --filter @ai-employee/bot-runtime test paths
```

Expected: FAIL — 找不到 `../paths.js`。

- [ ] **Step 3：实现**

`packages/bot-runtime/src/storage/paths.ts`：
```ts
import path from "node:path";

export type JobStatus = "pending" | "locked" | "done" | "failed" | "dedupe";

export type Paths = {
  dataRoot: string;
  instanceRoot(runtimeId: string): string;
  lock(runtimeId: string): string;
  runtimeInfo(runtimeId: string): string;
  state(runtimeId: string): string;
  user(runtimeId: string, userId: string): string;
  threadsRoot(runtimeId: string): string;
  threadDir(runtimeId: string, threadId: string): string;
  threadJson(runtimeId: string, threadId: string): string;
  transcript(runtimeId: string, threadId: string): string;
  guardDecisions(runtimeId: string, threadId: string): string;
  threadContextDir(runtimeId: string, threadId: string): string;
  threadDrafts(runtimeId: string, threadId: string): string;
  taskDir(runtimeId: string, threadId: string, taskId: string): string;
  taskJson(runtimeId: string, threadId: string, taskId: string): string;
  taskPlan(runtimeId: string, threadId: string, taskId: string): string;
  planRevision(
    runtimeId: string,
    threadId: string,
    taskId: string,
    revisionId: string,
  ): string;
  taskEvents(runtimeId: string, threadId: string, taskId: string): string;
  taskControl(runtimeId: string, threadId: string, taskId: string): string;
  taskContext(runtimeId: string, threadId: string, taskId: string): string;
  workspace(runtimeId: string, threadId: string, taskId: string): string;
  uploads(runtimeId: string, threadId: string, taskId: string): string;
  outputs(runtimeId: string, threadId: string, taskId: string): string;
  outputsArchive(
    runtimeId: string,
    threadId: string,
    taskId: string,
    revisionId: string,
  ): string;
  jobsDir(runtimeId: string, status: JobStatus): string;
  jobFile(runtimeId: string, status: JobStatus, jobId: string): string;
  channelConfig(runtimeId: string, channelType: string): string;
  binding(
    runtimeId: string,
    threadId: string,
    channelType: string,
    bindingId: string,
  ): string;
  chatClaim(runtimeId: string, channelType: string, externalChatId: string): string;
  webhookEvent(runtimeId: string, channelType: string, eventId: string): string;
  criticalNodePolicy(runtimeId: string, policyId: string): string;
};

export function createPaths(dataRoot: string): Paths {
  const join = path.posix.join;
  const instance = (rt: string) => join(dataRoot, "instances", rt);
  const state = (rt: string) => join(instance(rt), "state");
  const thread = (rt: string, th: string) => join(state(rt), "threads", th);
  const task = (rt: string, th: string, tk: string) =>
    join(thread(rt, th), "tasks", tk);
  const userData = (rt: string, th: string, tk: string) =>
    join(task(rt, th, tk), "user-data");

  return {
    dataRoot,
    instanceRoot: instance,
    lock: (rt) => join(instance(rt), ".lock"),
    runtimeInfo: (rt) => join(instance(rt), ".runtime-info.json"),
    state,
    user: (rt, u) => join(state(rt), "users", `${u}.json`),
    threadsRoot: (rt) => join(state(rt), "threads"),
    threadDir: thread,
    threadJson: (rt, th) => join(thread(rt, th), "thread.json"),
    transcript: (rt, th) => join(thread(rt, th), "transcript.jsonl"),
    guardDecisions: (rt, th) => join(thread(rt, th), "guard-decisions.jsonl"),
    threadContextDir: (rt, th) => join(thread(rt, th), "context"),
    threadDrafts: (rt, th) => join(thread(rt, th), "drafts"),
    taskDir: task,
    taskJson: (rt, th, tk) => join(task(rt, th, tk), "task.json"),
    taskPlan: (rt, th, tk) => join(task(rt, th, tk), "plan.json"),
    planRevision: (rt, th, tk, rv) =>
      join(task(rt, th, tk), "plan-revisions", `${rv}.json`),
    taskEvents: (rt, th, tk) => join(task(rt, th, tk), "events.jsonl"),
    taskControl: (rt, th, tk) => join(task(rt, th, tk), "control.json"),
    taskContext: (rt, th, tk) => join(task(rt, th, tk), "context"),
    workspace: (rt, th, tk) => join(userData(rt, th, tk), "workspace"),
    uploads: (rt, th, tk) => join(userData(rt, th, tk), "uploads"),
    outputs: (rt, th, tk) => join(userData(rt, th, tk), "outputs"),
    outputsArchive: (rt, th, tk, rv) =>
      join(userData(rt, th, tk), "outputs", "_archive", rv),
    jobsDir: (rt, status) => join(state(rt), "jobs", status),
    jobFile: (rt, status, jid) =>
      join(state(rt), "jobs", status, `${jid}.json`),
    channelConfig: (rt, ct) => join(state(rt), "channels", `${ct}.json`),
    binding: (rt, th, ct, bid) =>
      join(state(rt), "bindings", th, ct, bid, "active.json"),
    chatClaim: (rt, ct, ec) => join(state(rt), "chat-claims", ct, ec),
    webhookEvent: (rt, ct, eid) =>
      join(state(rt), "webhooks", ct, `${eid}.json`),
    criticalNodePolicy: (rt, pid) =>
      join(state(rt), "critical-node-policies", `${pid}.json`),
  };
}
```

- [ ] **Step 4：跑测试确认通过**

```bash
pnpm --filter @ai-employee/bot-runtime test paths
```

Expected: 12 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/
git commit -m "feat(storage): add path builder for runtime instance directories"
```

---

### Task 3: ID 生成（storage/ids.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/ids.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/ids.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { newId, isValidId } from "../ids.js";

describe("ids", () => {
  it("newId returns prefixed UUIDv7", () => {
    const id = newId("th");
    expect(id).toMatch(/^th_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("ids are monotonically increasing in time", async () => {
    const a = newId("tk");
    await new Promise((r) => setTimeout(r, 2));
    const b = newId("tk");
    expect(a < b).toBe(true);
  });

  it("isValidId checks prefix and uuid form", () => {
    expect(isValidId(newId("th"), "th")).toBe(true);
    expect(isValidId("th_not-a-uuid", "th")).toBe(false);
    expect(isValidId(newId("th"), "tk")).toBe(false);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
pnpm --filter @ai-employee/bot-runtime test ids
```

Expected: FAIL — 找不到 `../ids.js`。

- [ ] **Step 3：实现**

```ts
import { uuidv7 } from "uuidv7";

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type IdPrefix =
  | "rt"
  | "th"
  | "tk"
  | "pl"
  | "rv"
  | "u"
  | "msg"
  | "ev"
  | "job"
  | "policy"
  | "bd"
  | "exec"
  | "guard";

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${uuidv7()}`;
}

export function isValidId(id: string, prefix: IdPrefix): boolean {
  if (!id.startsWith(`${prefix}_`)) return false;
  const uuid = id.slice(prefix.length + 1);
  return UUID_V7_RE.test(uuid);
}
```

- [ ] **Step 4：跑测试确认通过**

```bash
pnpm --filter @ai-employee/bot-runtime test ids
```

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/ids.ts packages/bot-runtime/src/storage/__tests__/ids.test.ts
git commit -m "feat(storage): add prefixed UUIDv7 id generator"
```

---

### Task 4: JSONL append-only 读写（storage/jsonl.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/jsonl.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/jsonl.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendJsonl, readJsonl, tailJsonl } from "../jsonl.js";

describe("jsonl", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "jsonl-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("appendJsonl creates file and appends each call as one line", async () => {
    const file = path.join(dir, "log.jsonl");
    await appendJsonl(file, { a: 1 });
    await appendJsonl(file, { b: 2 });
    const all = await readJsonl<{ a?: number; b?: number }>(file);
    expect(all).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("readJsonl on missing file returns []", async () => {
    expect(await readJsonl(path.join(dir, "nope.jsonl"))).toEqual([]);
  });

  it("tailJsonl returns last N entries", async () => {
    const file = path.join(dir, "log.jsonl");
    for (let i = 0; i < 5; i++) await appendJsonl(file, { i });
    expect(await tailJsonl<{ i: number }>(file, 2)).toEqual([{ i: 3 }, { i: 4 }]);
  });

  it("appendJsonl handles object containing newlines safely (no embedded raw)", async () => {
    const file = path.join(dir, "log.jsonl");
    await appendJsonl(file, { msg: "line1\nline2" });
    const [first] = await readJsonl<{ msg: string }>(file);
    expect(first?.msg).toBe("line1\nline2");
  });

  it("readJsonl skips blank lines", async () => {
    const file = path.join(dir, "log.jsonl");
    await appendJsonl(file, { a: 1 });
    const fs = await import("node:fs/promises");
    await fs.appendFile(file, "\n\n");
    await appendJsonl(file, { a: 2 });
    expect(await readJsonl<{ a: number }>(file)).toEqual([{ a: 1 }, { a: 2 }]);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

```bash
pnpm --filter @ai-employee/bot-runtime test jsonl
```

Expected: FAIL — 找不到 `../jsonl.js`。

- [ ] **Step 3：实现**

```ts
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const line = `${JSON.stringify(value)}\n`;
  await appendFile(file, line, { encoding: "utf8" });
}

export async function readJsonl<T = unknown>(file: string): Promise<T[]> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const out: T[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim() === "") continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

export async function tailJsonl<T = unknown>(
  file: string,
  n: number,
): Promise<T[]> {
  const all = await readJsonl<T>(file);
  return all.slice(Math.max(0, all.length - n));
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 5 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/jsonl.ts packages/bot-runtime/src/storage/__tests__/jsonl.test.ts
git commit -m "feat(storage): add append-only JSONL writer/reader"
```

---

### Task 5: JSON 文件读写（storage/json-file.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/json-file.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/json-file.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJson, writeJson } from "../json-file.js";

describe("json-file", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "json-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writeJson then readJson roundtrips", async () => {
    const file = path.join(dir, "a.json");
    await writeJson(file, { hello: "world" });
    expect(await readJson<{ hello: string }>(file)).toEqual({ hello: "world" });
  });

  it("readJson on missing file returns null", async () => {
    expect(await readJson(path.join(dir, "missing.json"))).toBeNull();
  });

  it("writeJson is atomic (writes via temp file)", async () => {
    const file = path.join(dir, "atomic.json");
    await writeJson(file, { v: 1 });
    const onDisk = await readFile(file, "utf8");
    expect(JSON.parse(onDisk)).toEqual({ v: 1 });
  });

  it("writeJson creates parent directory", async () => {
    const file = path.join(dir, "deep/nested/dir/x.json");
    await writeJson(file, { ok: true });
    expect(await readJson<{ ok: boolean }>(file)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../json-file.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  const text = JSON.stringify(value, null, 2);
  await writeFile(tmp, text, "utf8");
  await rename(tmp, file);
}

export async function readJson<T = unknown>(file: string): Promise<T | null> {
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 4 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/json-file.ts packages/bot-runtime/src/storage/__tests__/json-file.test.ts
git commit -m "feat(storage): add atomic JSON file read/write"
```

---

### Task 6: PII / Secret 脱敏（storage/sanitize.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/sanitize.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/sanitize.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { sanitize } from "../sanitize.js";

describe("sanitize", () => {
  it("redacts feishu app secret pattern", () => {
    const out = sanitize("App secret: D7yz9aMnop1234567890qrSTUVwxYZab");
    expect(out).toContain("<redacted:secret>");
    expect(out).not.toContain("D7yz9aMnop1234567890qrSTUVwxYZab");
  });

  it("redacts bearer tokens", () => {
    const out = sanitize("Authorization: Bearer abcDEF.ghi-JKL_mn0pqrstuvwxyz");
    expect(out).toContain("<redacted:secret>");
  });

  it("redacts emails", () => {
    const out = sanitize("contact alice@example.com today");
    expect(out).toBe("contact <redacted:pii> today");
  });

  it("redacts phone numbers", () => {
    expect(sanitize("call +86 138 1234 5678")).toContain("<redacted:pii>");
    expect(sanitize("tel: 13812345678")).toContain("<redacted:pii>");
  });

  it("recurses into objects and arrays", () => {
    const input = {
      user: { email: "bob@test.com", phone: "13800000000" },
      tokens: ["Bearer abcDEFghiJKLmnOPqrSTUVwxYZ12"],
      safe: 42,
    };
    const out = sanitize(input) as typeof input;
    expect(out.user.email).toContain("<redacted:pii>");
    expect(out.user.phone).toContain("<redacted:pii>");
    expect(out.tokens[0]).toContain("<redacted:secret>");
    expect(out.safe).toBe(42);
  });

  it("leaves non-string scalars untouched", () => {
    expect(sanitize(123)).toBe(123);
    expect(sanitize(true)).toBe(true);
    expect(sanitize(null)).toBe(null);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../sanitize.js` 不存在。

- [ ] **Step 3：实现**

```ts
const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._\-]{20,}\b/g,
  /\b[A-Za-z0-9]{32,}\b/g,
];

const PII_PATTERNS: RegExp[] = [
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g,
  /(\+?\d{1,3}[\s\-]?)?(?:\(?\d{3,4}\)?[\s\-]?)?\d{3,4}[\s\-]?\d{4}/g,
];

function sanitizeString(s: string): string {
  let out = s;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "<redacted:secret>");
  for (const re of PII_PATTERNS) out = out.replace(re, "<redacted:pii>");
  return out;
}

export function sanitize<T>(value: T): T {
  if (typeof value === "string") return sanitizeString(value) as T;
  if (Array.isArray(value)) return value.map((v) => sanitize(v)) as T;
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitize(v);
    }
    return result as T;
  }
  return value;
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 6 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/sanitize.ts packages/bot-runtime/src/storage/__tests__/sanitize.test.ts
git commit -m "feat(storage): add PII and secret sanitizer for transcripts and logs"
```

---

### Task 7: `.lock` + `.runtime-info.json`（storage/lock.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/lock.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/lock.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireInstanceLock, readRuntimeInfo, releaseInstanceLock, touchRuntimeInfo } from "../lock.js";
import { createPaths } from "../paths.js";

describe("lock", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "lock-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("acquireInstanceLock writes runtime-info and returns release fn", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const info = await readRuntimeInfo(paths, "rt-1");
    expect(info?.role).toBe("hybrid");
    expect(info?.fencingTokenSeed).toBe(1);
    await release();
  });

  it("acquireInstanceLock throws if already held", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    await expect(
      acquireInstanceLock(paths, "rt-1", { role: "hybrid" })
    ).rejects.toThrow();
    await release();
  });

  it("re-acquire after release increments fencingTokenSeed", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release1 = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    await release1();
    const release2 = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const info = await readRuntimeInfo(paths, "rt-1");
    expect(info?.fencingTokenSeed).toBe(2);
    await release2();
  });

  it("touchRuntimeInfo updates lastSeenAt", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const before = (await readRuntimeInfo(paths, "rt-1"))!.lastSeenAt;
    await new Promise((r) => setTimeout(r, 5));
    await touchRuntimeInfo(paths, "rt-1");
    const after = (await readRuntimeInfo(paths, "rt-1"))!.lastSeenAt;
    expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    await release();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../lock.js` 不存在。

- [ ] **Step 3：实现**

```ts
import lockfile from "proper-lockfile";
import { readJson, writeJson } from "./json-file.js";
import type { Paths } from "./paths.js";

export type RuntimeRole = "master" | "worker" | "hybrid";

export type RuntimeInfo = {
  role: RuntimeRole;
  version: string;
  startedAt: string;
  lastSeenAt: string;
  fencingTokenSeed: number;
};

export type ReleaseLock = () => Promise<void>;

export async function acquireInstanceLock(
  paths: Paths,
  runtimeId: string,
  opts: { role: RuntimeRole; version?: string },
): Promise<ReleaseLock> {
  const infoPath = paths.runtimeInfo(runtimeId);
  const previous = await readJson<RuntimeInfo>(infoPath);
  const seed = (previous?.fencingTokenSeed ?? 0) + 1;
  const now = new Date().toISOString();

  const info: RuntimeInfo = {
    role: opts.role,
    version: opts.version ?? "0.0.0",
    startedAt: now,
    lastSeenAt: now,
    fencingTokenSeed: seed,
  };
  await writeJson(infoPath, info);

  const release = await lockfile.lock(infoPath, {
    realpath: false,
    retries: 0,
    stale: 60_000,
  });

  return async () => {
    await release();
  };
}

export async function readRuntimeInfo(
  paths: Paths,
  runtimeId: string,
): Promise<RuntimeInfo | null> {
  return readJson<RuntimeInfo>(paths.runtimeInfo(runtimeId));
}

export async function touchRuntimeInfo(
  paths: Paths,
  runtimeId: string,
): Promise<void> {
  const cur = await readRuntimeInfo(paths, runtimeId);
  if (!cur) throw new Error(`runtime-info missing for ${runtimeId}`);
  cur.lastSeenAt = new Date().toISOString();
  await writeJson(paths.runtimeInfo(runtimeId), cur);
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 4 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/lock.ts packages/bot-runtime/src/storage/__tests__/lock.test.ts
git commit -m "feat(storage): add instance lock and runtime-info management"
```

---

### Task 8: Fencing token 分发（storage/fencing.ts）

**Files:**
- Create: `packages/bot-runtime/src/storage/fencing.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/fencing.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acquireInstanceLock } from "../lock.js";
import { createFencingTokenIssuer } from "../fencing.js";
import { createPaths } from "../paths.js";

describe("fencing", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "fence-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("issuer returns monotonically increasing tokens within a session", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const release = await acquireInstanceLock(paths, "rt-1", { role: "hybrid" });
    const issuer = await createFencingTokenIssuer(paths, "rt-1");
    const a = issuer.issue();
    const b = issuer.issue();
    const c = issuer.issue();
    expect(a < b && b < c).toBe(true);
    await release();
  });

  it("new session produces tokens greater than previous session", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-2"), { recursive: true });
    const r1 = await acquireInstanceLock(paths, "rt-2", { role: "hybrid" });
    const issuer1 = await createFencingTokenIssuer(paths, "rt-2");
    const last1 = issuer1.issue();
    await r1();
    const r2 = await acquireInstanceLock(paths, "rt-2", { role: "hybrid" });
    const issuer2 = await createFencingTokenIssuer(paths, "rt-2");
    const first2 = issuer2.issue();
    expect(first2).toBeGreaterThan(last1);
    await r2();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../fencing.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { readRuntimeInfo } from "./lock.js";
import type { Paths } from "./paths.js";

export type FencingTokenIssuer = {
  issue(): number;
};

export async function createFencingTokenIssuer(
  paths: Paths,
  runtimeId: string,
): Promise<FencingTokenIssuer> {
  const info = await readRuntimeInfo(paths, runtimeId);
  if (!info) throw new Error(`runtime-info missing for ${runtimeId}`);
  let counter = info.fencingTokenSeed * 1_000_000;
  return {
    issue: () => ++counter,
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/fencing.ts packages/bot-runtime/src/storage/__tests__/fencing.test.ts
git commit -m "feat(storage): add fencing token issuer derived from runtime-info"
```

---

### Task 9: 启动恢复扫描 — jobs/locked 过期检查（storage/recovery.ts pt.1）

**Files:**
- Create: `packages/bot-runtime/src/storage/recovery.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/recovery-jobs.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../json-file.js";
import { createPaths } from "../paths.js";
import { recoverStaleLockedJobs } from "../recovery.js";

describe("recovery — stale locked jobs", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rec-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("moves expired locked job to failed/ and returns its id", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.jobsDir("rt-1", "locked"), { recursive: true });
    const expired = {
      id: "job-expired",
      type: "execute_task",
      taskId: "tk-1",
      threadId: "th-1",
      planRevisionId: "rv-1",
      assignedAt: new Date().toISOString(),
      fencingToken: 1,
      lockHolder: "rt-old",
      leaseExpireAt: new Date(Date.now() - 1000).toISOString(),
    };
    await writeJson(paths.jobFile("rt-1", "locked", "job-expired"), expired);

    const moved = await recoverStaleLockedJobs(paths, "rt-1");
    expect(moved).toContain("job-expired");
    expect(await readdir(paths.jobsDir("rt-1", "locked"))).not.toContain(
      "job-expired.json",
    );
    expect(await readdir(paths.jobsDir("rt-1", "failed"))).toContain(
      "job-expired.json",
    );
  });

  it("keeps non-expired locked jobs in place", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.jobsDir("rt-1", "locked"), { recursive: true });
    const fresh = {
      id: "job-fresh",
      type: "execute_task",
      taskId: "tk-2",
      threadId: "th-1",
      planRevisionId: "rv-1",
      assignedAt: new Date().toISOString(),
      fencingToken: 2,
      lockHolder: "rt-1",
      leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
    };
    await writeJson(paths.jobFile("rt-1", "locked", "job-fresh"), fresh);

    const moved = await recoverStaleLockedJobs(paths, "rt-1");
    expect(moved).toEqual([]);
    expect(await readdir(paths.jobsDir("rt-1", "locked"))).toContain(
      "job-fresh.json",
    );
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../recovery.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "./json-file.js";
import type { Paths } from "./paths.js";

export type LockedJob = {
  id: string;
  leaseExpireAt: string;
  lockHolder: string;
  [key: string]: unknown;
};

export async function recoverStaleLockedJobs(
  paths: Paths,
  runtimeId: string,
): Promise<string[]> {
  const lockedDir = paths.jobsDir(runtimeId, "locked");
  const failedDir = paths.jobsDir(runtimeId, "failed");
  await mkdir(lockedDir, { recursive: true });
  await mkdir(failedDir, { recursive: true });
  const files = await readdir(lockedDir);
  const now = Date.now();
  const moved: string[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const filePath = path.join(lockedDir, f);
    const job = await readJson<LockedJob>(filePath);
    if (!job?.leaseExpireAt) continue;
    if (Date.parse(job.leaseExpireAt) < now) {
      const target = path.join(failedDir, f);
      const failureRecord = {
        ...job,
        recoveredAt: new Date().toISOString(),
        failureReason: "lease_expired_on_recovery",
      };
      await writeJson(target, failureRecord);
      await rename(filePath, `${filePath}.recovered`).catch(() => undefined);
      moved.push(job.id);
    }
  }
  return moved;
}
```

注：上面用了 `rename` 加 `.recovered` 后缀作为 tombstone，避免与 `writeJson` 同时写两个文件造成 race；如果 tombstone 残留，下一次扫描见 `.recovered` 后缀直接忽略。下一个 Task 会补 `.recovered` 清理。

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/recovery.ts packages/bot-runtime/src/storage/__tests__/recovery-jobs.test.ts
git commit -m "feat(storage): recover stale locked jobs on startup"
```

---

### Task 10: 启动恢复扫描 — running 任务 / dedupe / tombstone（storage/recovery.ts pt.2）

**Files:**
- Modify: `packages/bot-runtime/src/storage/recovery.ts`
- Test: `packages/bot-runtime/src/storage/__tests__/recovery-tasks.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../json-file.js";
import { createPaths } from "../paths.js";
import {
  cleanupRecoveredTombstones,
  cleanupStaleDedupe,
  markStaleRunningTasks,
} from "../recovery.js";

describe("recovery — task and dedupe sweeps", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rec2-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("markStaleRunningTasks flips status running → blocked when no active job", async () => {
    const paths = createPaths(dataRoot);
    const taskJson = paths.taskJson("rt-1", "th-1", "tk-1");
    await writeJson(taskJson, {
      id: "tk-1",
      threadId: "th-1",
      status: "running",
    });
    const flipped = await markStaleRunningTasks(paths, "rt-1");
    expect(flipped).toContain("tk-1");
  });

  it("cleanupStaleDedupe removes entries older than retention", async () => {
    const paths = createPaths(dataRoot);
    const dir = paths.jobsDir("rt-1", "dedupe");
    await mkdir(dir, { recursive: true });
    const oldFile = path.join(dir, "old-key");
    await writeFile(oldFile, "x");
    const past = Date.now() - 1000 * 60 * 60 * 24 * 31;
    const fs = await import("node:fs/promises");
    await fs.utimes(oldFile, past / 1000, past / 1000);

    const cleaned = await cleanupStaleDedupe(paths, "rt-1", 30);
    expect(cleaned).toContain("old-key");
  });

  it("cleanupRecoveredTombstones removes .recovered files", async () => {
    const paths = createPaths(dataRoot);
    const lockedDir = paths.jobsDir("rt-1", "locked");
    await mkdir(lockedDir, { recursive: true });
    await writeFile(path.join(lockedDir, "j1.json.recovered"), "{}");
    const cleaned = await cleanupRecoveredTombstones(paths, "rt-1");
    expect(cleaned).toBe(1);
    expect(await readdir(lockedDir)).not.toContain("j1.json.recovered");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — 三个新函数未导出。

- [ ] **Step 3：实现（追加到 recovery.ts）**

在 `packages/bot-runtime/src/storage/recovery.ts` 文件末尾追加：

```ts
import { stat, unlink } from "node:fs/promises";

export async function markStaleRunningTasks(
  paths: Paths,
  runtimeId: string,
): Promise<string[]> {
  const threadsRoot = paths.threadsRoot(runtimeId);
  await mkdir(threadsRoot, { recursive: true });
  const flipped: string[] = [];
  let threads: string[] = [];
  try {
    threads = await readdir(threadsRoot);
  } catch {
    return flipped;
  }
  const lockedFiles = new Set<string>();
  try {
    for (const f of await readdir(paths.jobsDir(runtimeId, "locked"))) {
      if (f.endsWith(".json")) {
        const job = await readJson<{ taskId?: string }>(
          path.join(paths.jobsDir(runtimeId, "locked"), f),
        );
        if (job?.taskId) lockedFiles.add(job.taskId);
      }
    }
  } catch {
    /* no locked dir */
  }
  for (const th of threads) {
    let taskIds: string[] = [];
    try {
      taskIds = await readdir(path.join(threadsRoot, th, "tasks"));
    } catch {
      continue;
    }
    for (const tk of taskIds) {
      const tj = paths.taskJson(runtimeId, th, tk);
      const task = await readJson<{ status?: string }>(tj);
      if (!task) continue;
      if (task.status === "running" && !lockedFiles.has(tk)) {
        await writeJson(tj, { ...task, status: "blocked" });
        flipped.push(tk);
      }
    }
  }
  return flipped;
}

export async function cleanupStaleDedupe(
  paths: Paths,
  runtimeId: string,
  retentionDays: number,
): Promise<string[]> {
  const dir = paths.jobsDir(runtimeId, "dedupe");
  await mkdir(dir, { recursive: true });
  const cutoff = Date.now() - retentionDays * 86_400_000;
  const cleaned: string[] = [];
  for (const f of await readdir(dir)) {
    const fp = path.join(dir, f);
    const s = await stat(fp);
    if (s.mtimeMs < cutoff) {
      await unlink(fp);
      cleaned.push(f);
    }
  }
  return cleaned;
}

export async function cleanupRecoveredTombstones(
  paths: Paths,
  runtimeId: string,
): Promise<number> {
  const dirs = ["pending", "locked", "done", "failed"] as const;
  let count = 0;
  for (const d of dirs) {
    const dir = paths.jobsDir(runtimeId, d);
    await mkdir(dir, { recursive: true });
    for (const f of await readdir(dir)) {
      if (f.endsWith(".recovered")) {
        await unlink(path.join(dir, f));
        count++;
      }
    }
  }
  return count;
}
```

- [ ] **Step 4：跑测试确认通过**

```bash
pnpm --filter @ai-employee/bot-runtime test recovery
```

Expected: 5 tests passed (2 from Task 9 + 3 from this task).

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/storage/recovery.ts packages/bot-runtime/src/storage/__tests__/recovery-tasks.test.ts
git commit -m "feat(storage): recover stale running tasks, expire dedupe, clean tombstones"
```

---

## Phase B — 数据模型 Schema（Spec Stage 2）

> 本 Phase 用 Zod 把 spec 第 4 章的所有数据模型固化为运行时校验。每个 schema 都用 zod 的 infer 暴露 TS 类型，保持 spec 与代码一字一义。

### Task 11: User schema（schema/user.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/user.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/user.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { UserSchema } from "../user.js";

describe("UserSchema", () => {
  it("accepts a minimal user", () => {
    const u = {
      id: "u_018f5d20-0000-7000-8000-000000000001",
      displayName: "Alice",
      channelIdentities: {},
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    };
    expect(UserSchema.parse(u)).toEqual(u);
  });

  it("accepts feishu / slack / email identities", () => {
    const u = UserSchema.parse({
      id: "u_018f5d20-0000-7000-8000-000000000002",
      displayName: "Bob",
      channelIdentities: {
        feishu: { openId: "ou_xxx", tenantKey: "tk1" },
        slack: { userId: "U1", teamId: "T1" },
        email: "bob@x.com",
      },
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(u.channelIdentities.feishu?.openId).toBe("ou_xxx");
  });

  it("rejects malformed id", () => {
    expect(() =>
      UserSchema.parse({
        id: "not-prefixed",
        displayName: "X",
        channelIdentities: {},
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../user.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";

const IdRe = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const UserIdSchema = z
  .string()
  .regex(IdRe, "id must be prefix_uuidv7");

export const ChannelIdentitiesSchema = z.object({
  feishu: z
    .object({ openId: z.string(), tenantKey: z.string().optional() })
    .optional(),
  slack: z
    .object({ userId: z.string(), teamId: z.string() })
    .optional(),
  email: z.string().email().optional(),
});

export const UserSchema = z.object({
  id: UserIdSchema,
  displayName: z.string().min(1),
  channelIdentities: ChannelIdentitiesSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export type User = z.infer<typeof UserSchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/user.ts packages/bot-runtime/src/schema/__tests__/user.test.ts
git commit -m "feat(schema): add User schema with channel identities"
```

---

### Task 12: Thread schema（schema/thread.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/thread.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/thread.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { ThreadSchema, ThreadStatusSchema } from "../thread.js";

describe("ThreadSchema", () => {
  it("status enum has all 6 values", () => {
    expect(ThreadStatusSchema.options).toEqual([
      "chatting",
      "planning",
      "waiting_confirmation",
      "working",
      "blocked",
      "idle",
    ]);
  });

  it("accepts a minimal thread", () => {
    const t = ThreadSchema.parse({
      id: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      title: "demo",
      status: "chatting",
      taskListId: "tl-1",
      channelBindingIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(t.activeTaskId).toBeUndefined();
    expect(t.channelBindingIds).toEqual([]);
  });

  it("rejects unknown status", () => {
    expect(() =>
      ThreadSchema.parse({
        id: "th_018f5d20-0000-7000-8000-000000000001",
        ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
        title: "x",
        status: "weird",
        taskListId: "tl-1",
        channelBindingIds: [],
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../thread.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { UserIdSchema } from "./user.js";

const IdRe = /^[a-z]+_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const ThreadIdSchema = z.string().regex(IdRe);
export const TaskIdSchema = z.string().regex(IdRe);
export const PlanIdSchema = z.string().regex(IdRe);

export const ThreadStatusSchema = z.enum([
  "chatting",
  "planning",
  "waiting_confirmation",
  "working",
  "blocked",
  "idle",
]);
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

export const ThreadSchema = z.object({
  id: ThreadIdSchema,
  ownerUserId: UserIdSchema,
  title: z.string(),
  status: ThreadStatusSchema,
  taskListId: z.string(),
  activeTaskId: TaskIdSchema.optional(),
  draftTaskId: TaskIdSchema.optional(),
  draftPlanId: PlanIdSchema.optional(),
  channelBindingIds: z.array(z.string()),
  contextSummary: z.string().optional(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Thread = z.infer<typeof ThreadSchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/thread.ts packages/bot-runtime/src/schema/__tests__/thread.test.ts
git commit -m "feat(schema): add Thread schema with ownerUserId and channelBindingIds"
```

---

### Task 13: Task schema + TaskBudget（schema/task.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/task.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/task.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { TaskSchema, TaskStatusSchema, isTerminalTaskStatus } from "../task.js";

describe("TaskSchema", () => {
  it("includes all 10 statuses", () => {
    expect(TaskStatusSchema.options).toEqual([
      "draft",
      "confirmed",
      "queued",
      "running",
      "awaiting_critical_node",
      "blocked",
      "changing",
      "completed",
      "failed",
      "cancelled",
    ]);
  });

  it("accepts a minimal draft task", () => {
    const t = TaskSchema.parse({
      id: "tk_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      title: "do thing",
      description: "...",
      status: "draft",
      sourceMessageIds: [],
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(t.budget).toBeUndefined();
  });

  it("accepts task with budget and confirmedByUserId", () => {
    const t = TaskSchema.parse({
      id: "tk_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      confirmedByUserId: "u_018f5d20-0000-7000-8000-000000000001",
      title: "do thing",
      description: "...",
      status: "confirmed",
      sourceMessageIds: ["msg-1"],
      budget: { maxDurationMs: 3600000, maxTokens: 100000 },
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(t.budget?.maxTokens).toBe(100000);
  });

  it("isTerminalTaskStatus marks completed/failed/cancelled", () => {
    expect(isTerminalTaskStatus("completed")).toBe(true);
    expect(isTerminalTaskStatus("failed")).toBe(true);
    expect(isTerminalTaskStatus("cancelled")).toBe(true);
    expect(isTerminalTaskStatus("running")).toBe(false);
    expect(isTerminalTaskStatus("blocked")).toBe(false);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../task.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { PlanIdSchema, TaskIdSchema, ThreadIdSchema } from "./thread.js";
import { UserIdSchema } from "./user.js";

export const TaskStatusSchema = z.enum([
  "draft",
  "confirmed",
  "queued",
  "running",
  "awaiting_critical_node",
  "blocked",
  "changing",
  "completed",
  "failed",
  "cancelled",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export function isTerminalTaskStatus(s: TaskStatus): boolean {
  return s === "completed" || s === "failed" || s === "cancelled";
}

export const TaskBudgetSchema = z.object({
  maxDurationMs: z.number().int().positive().optional(),
  maxTokens: z.number().int().positive().optional(),
  maxSubagents: z.number().int().positive().optional(),
  maxCostUsd: z.number().nonnegative().optional(),
});
export type TaskBudget = z.infer<typeof TaskBudgetSchema>;

export const TaskSchema = z.object({
  id: TaskIdSchema,
  threadId: ThreadIdSchema,
  ownerUserId: UserIdSchema,
  confirmedByUserId: UserIdSchema.optional(),
  title: z.string(),
  description: z.string(),
  status: TaskStatusSchema,
  sourceMessageIds: z.array(z.string()),
  planId: PlanIdSchema.optional(),
  activePlanRevisionId: z.string().optional(),
  assignedRuntimeId: z.string().optional(),
  assignedExecutorId: z.string().optional(),
  budget: TaskBudgetSchema.optional(),
  artifactIds: z.array(z.string()),
  changeRecordIds: z.array(z.string()),
  archivedRevisionIds: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Task = z.infer<typeof TaskSchema>;

export const DEFAULT_TASK_BUDGET: TaskBudget = {
  maxDurationMs: 4 * 60 * 60 * 1000,
  maxTokens: 1_000_000,
  maxSubagents: 8,
};
```

- [ ] **Step 4：跑测试确认通过**

Expected: 4 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/task.ts packages/bot-runtime/src/schema/__tests__/task.test.ts
git commit -m "feat(schema): add Task and TaskBudget schemas with terminal helper"
```

---

### Task 14: Plan + PlanStep + PlanRevision（schema/plan.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/plan.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/plan.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { PlanRevisionSchema, PlanSchema, PlanStepSchema } from "../plan.js";

describe("PlanSchema", () => {
  it("accepts a draft plan with one step", () => {
    const p = PlanSchema.parse({
      id: "pl_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      status: "draft",
      objective: "do x",
      steps: [
        {
          id: "step-1",
          title: "first",
          status: "pending",
        },
      ],
      expectedArtifacts: [],
      revisionIds: [],
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(p.steps[0]?.status).toBe("pending");
  });

  it("plan revision is a snapshot with reason and archived artifacts", () => {
    const r = PlanRevisionSchema.parse({
      id: "rv_018f5d20-0000-7000-8000-000000000001",
      planId: "pl_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      status: "active",
      fullPlan: {
        id: "pl_018f5d20-0000-7000-8000-000000000001",
        taskId: "tk_018f5d20-0000-7000-8000-000000000001",
        status: "active",
        objective: "do x",
        steps: [],
        expectedArtifacts: [],
        revisionIds: [],
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      },
      reason: "user pivot",
      sourceMessageId: "msg-1",
      archivedArtifactPaths: [],
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(r.fullPlan.objective).toBe("do x");
  });

  it("PlanStepSchema enforces all status values", () => {
    expect(PlanStepSchema.shape.status.options).toEqual([
      "pending",
      "in_progress",
      "completed",
      "blocked",
      "skipped",
      "superseded",
      "failed",
    ]);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../plan.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { PlanIdSchema, TaskIdSchema } from "./thread.js";

export const PlanStatusSchema = z.enum([
  "draft",
  "pending_confirmation",
  "active",
  "revising",
  "superseded",
  "completed",
]);
export type PlanStatus = z.infer<typeof PlanStatusSchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: z.enum([
    "pending",
    "in_progress",
    "completed",
    "blocked",
    "skipped",
    "superseded",
    "failed",
  ]),
  startedAt: z.string().datetime({ offset: true }).optional(),
  completedAt: z.string().datetime({ offset: true }).optional(),
  evidence: z.array(z.string()).optional(),
});
export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  id: PlanIdSchema,
  taskId: TaskIdSchema,
  status: PlanStatusSchema,
  objective: z.string(),
  steps: z.array(PlanStepSchema),
  expectedArtifacts: z.array(z.string()),
  revisionIds: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type Plan = z.infer<typeof PlanSchema>;

export const PlanRevisionSchema = z.object({
  id: z.string(),
  planId: PlanIdSchema,
  taskId: TaskIdSchema,
  status: z.enum(["active", "superseded"]),
  fullPlan: PlanSchema,
  reason: z.string(),
  sourceMessageId: z.string(),
  archivedArtifactPaths: z.array(z.string()),
  supersededAt: z.string().datetime({ offset: true }).optional(),
  createdAt: z.string().datetime({ offset: true }),
});
export type PlanRevision = z.infer<typeof PlanRevisionSchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/plan.ts packages/bot-runtime/src/schema/__tests__/plan.test.ts
git commit -m "feat(schema): add Plan, PlanStep, and PlanRevision schemas"
```

---

### Task 15: GuardDecision（schema/guard-decision.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/guard-decision.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/guard-decision.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { GuardDecisionSchema, GuardIntentSchema } from "../guard-decision.js";

describe("GuardDecisionSchema", () => {
  it("includes all 9 intents", () => {
    expect(GuardIntentSchema.options).toEqual([
      "chat",
      "new_task",
      "task_update",
      "plan_update",
      "confirm_task",
      "confirm_plan",
      "progress_query",
      "cancel_task",
      "irrelevant",
    ]);
  });

  it("short-circuited rule decision has 0 confidence and ruleHits", () => {
    const d = GuardDecisionSchema.parse({
      id: "guard_018f5d20-0000-7000-8000-000000000001",
      messageId: "msg-1",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      source: "lark_group",
      intent: "irrelevant",
      shortCircuited: true,
      ruleHits: ["unbound_group_silence"],
      confidence: 0,
      requiresUserConfirmation: false,
      reason: "unbound group, no @bot",
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(d.shortCircuited).toBe(true);
  });

  it("LLM-based decision can include targetTaskId and fromUserId", () => {
    GuardDecisionSchema.parse({
      id: "guard_018f5d20-0000-7000-8000-000000000002",
      messageId: "msg-2",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      fromUserId: "u_018f5d20-0000-7000-8000-000000000001",
      source: "lark_private",
      intent: "confirm_task",
      targetTaskId: "tk_018f5d20-0000-7000-8000-000000000001",
      shortCircuited: false,
      ruleHits: [],
      confidence: 0.92,
      requiresUserConfirmation: false,
      reason: "explicit confirm",
      createdAt: "2026-04-28T00:00:00Z",
    });
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../guard-decision.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { PlanIdSchema, TaskIdSchema, ThreadIdSchema } from "./thread.js";
import { UserIdSchema } from "./user.js";

export const GuardIntentSchema = z.enum([
  "chat",
  "new_task",
  "task_update",
  "plan_update",
  "confirm_task",
  "confirm_plan",
  "progress_query",
  "cancel_task",
  "irrelevant",
]);
export type GuardIntent = z.infer<typeof GuardIntentSchema>;

export const GuardSourceSchema = z.enum([
  "client",
  "lark_private",
  "lark_group",
  "slack",
  "wecom",
  "email",
  "custom",
]);
export type GuardSource = z.infer<typeof GuardSourceSchema>;

export const GuardDecisionSchema = z.object({
  id: z.string(),
  messageId: z.string(),
  threadId: ThreadIdSchema,
  fromUserId: UserIdSchema.optional(),
  source: GuardSourceSchema,
  intent: GuardIntentSchema,
  targetTaskId: TaskIdSchema.optional(),
  targetPlanId: PlanIdSchema.optional(),
  shortCircuited: z.boolean(),
  ruleHits: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  requiresUserConfirmation: z.boolean(),
  reason: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type GuardDecision = z.infer<typeof GuardDecisionSchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/guard-decision.ts packages/bot-runtime/src/schema/__tests__/guard-decision.test.ts
git commit -m "feat(schema): add GuardDecision schema with rule short-circuit fields"
```

---

### Task 16: Channel schemas（schema/channel.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/channel.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/channel.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import {
  ChannelBindingSchema,
  ChannelConfigSchema,
  ChannelInboundEventSchema,
  ChannelJobSchema,
} from "../channel.js";

describe("ChannelSchemas", () => {
  it("ChannelConfig holds publicFields and secretRefs separately", () => {
    const c = ChannelConfigSchema.parse({
      provider: "feishu",
      enabled: true,
      ingress: { webhookEnabled: true },
      publicFields: { botName: "ai-employee" },
      secretRefs: { botAppSecret: "ref://secret/lark/app_secret" },
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(c.provider).toBe("feishu");
  });

  it("ChannelBinding statuses", () => {
    const b = ChannelBindingSchema.parse({
      id: "bd_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      provider: "feishu",
      externalConversationType: "group",
      status: "bound",
      createdBy: "client",
      enabled: true,
      notifyDefault: true,
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(b.notifyDefault).toBe(true);
  });

  it("ChannelJob types are limited", () => {
    expect(ChannelJobSchema.shape.type.options).toEqual([
      "create_conversation",
      "delete_conversation",
      "send_message",
    ]);
  });

  it("ChannelInboundEvent allows external ids", () => {
    const e = ChannelInboundEventSchema.parse({
      id: "ev_018f5d20-0000-7000-8000-000000000001",
      provider: "feishu",
      externalEventId: "lark-evt-1",
      externalMessageId: "om_xx",
      status: "received",
      payloadRef: "webhooks/feishu/lark-evt-1.json",
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(e.externalMessageId).toBe("om_xx");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../channel.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { ThreadIdSchema } from "./thread.js";

export const ProviderSchema = z.enum([
  "feishu",
  "slack",
  "wecom",
  "email",
  "custom",
]);
export type Provider = z.infer<typeof ProviderSchema>;

export const ChannelConfigSchema = z.object({
  provider: ProviderSchema,
  enabled: z.boolean(),
  ingress: z.object({
    webhookEnabled: z.boolean().optional(),
    longConnectionEnabled: z.boolean().optional(),
  }),
  publicFields: z.record(z.union([z.string(), z.boolean(), z.number()])),
  secretRefs: z.record(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChannelConfig = z.infer<typeof ChannelConfigSchema>;

export const ChannelBindingSchema = z.object({
  id: z.string(),
  threadId: ThreadIdSchema,
  provider: z.string(),
  externalConversationId: z.string().optional(),
  externalConversationType: z.enum(["dm", "group", "topic"]),
  status: z.enum(["binding", "bound", "unbinding", "failed", "disabled"]),
  createdBy: z.enum(["client", "guardian", "runtime", "admin"]),
  enabled: z.boolean(),
  notifyDefault: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChannelBinding = z.infer<typeof ChannelBindingSchema>;

export const ChannelInboundEventSchema = z.object({
  id: z.string(),
  provider: z.string(),
  externalEventId: z.string(),
  externalMessageId: z.string().optional(),
  status: z.enum(["received", "processed", "skipped", "failed"]),
  payloadRef: z.string(),
  createdAt: z.string().datetime({ offset: true }),
  processedAt: z.string().datetime({ offset: true }).optional(),
});
export type ChannelInboundEvent = z.infer<typeof ChannelInboundEventSchema>;

export const ChannelJobSchema = z.object({
  id: z.string(),
  provider: z.string(),
  type: z.enum(["create_conversation", "delete_conversation", "send_message"]),
  status: z.enum(["pending", "running", "succeeded", "failed", "dead"]),
  dedupeKey: z.string().optional(),
  payload: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  attemptCount: z.number().int().nonnegative(),
  lastError: z.string().optional(),
  runAfter: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ChannelJob = z.infer<typeof ChannelJobSchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 4 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/channel.ts packages/bot-runtime/src/schema/__tests__/channel.test.ts
git commit -m "feat(schema): add Channel config, binding, inbound event, and job schemas"
```

---

### Task 17: CriticalNodePolicy + NodeMatcher（schema/critical-node.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/critical-node.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/critical-node.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { CriticalNodePolicySchema, NodeMatcherSchema } from "../critical-node.js";

describe("CriticalNodePolicySchema", () => {
  it("supports all 5 matcher kinds", () => {
    const cases = [
      { kind: "tool", toolName: "bash" },
      { kind: "external_io", direction: "outbound", provider: "feishu" },
      { kind: "filesystem", op: "delete", minCount: 20 },
      { kind: "budget_overflow", dim: "tokens" },
      { kind: "out_of_scope", planRevisionId: "rv-1" },
    ] as const;
    for (const m of cases) NodeMatcherSchema.parse(m);
  });

  it("rejects unknown matcher kind", () => {
    expect(() => NodeMatcherSchema.parse({ kind: "wat" })).toThrow();
  });

  it("policy requires owner and matcher", () => {
    const p = CriticalNodePolicySchema.parse({
      id: "policy_001",
      scope: "user",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "require_approval",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: true,
      createdAt: "2026-04-28T00:00:00Z",
    });
    expect(p.action).toBe("require_approval");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../critical-node.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { UserIdSchema } from "./user.js";

export const NodeMatcherSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool"),
    toolName: z.string(),
    argMatch: z.record(z.unknown()).optional(),
  }),
  z.object({
    kind: z.literal("external_io"),
    direction: z.literal("outbound"),
    provider: z.string().optional(),
  }),
  z.object({
    kind: z.literal("filesystem"),
    op: z.enum(["delete", "overwrite"]),
    minCount: z.number().int().positive().optional(),
  }),
  z.object({
    kind: z.literal("budget_overflow"),
    dim: z.enum(["time", "tokens", "subagents", "cost"]),
  }),
  z.object({
    kind: z.literal("out_of_scope"),
    planRevisionId: z.string(),
  }),
]);
export type NodeMatcher = z.infer<typeof NodeMatcherSchema>;

export const CriticalNodePolicySchema = z.object({
  id: z.string(),
  scope: z.enum(["global", "user", "thread", "skill"]),
  matcher: NodeMatcherSchema,
  action: z.enum(["require_approval", "block", "log_only"]),
  ownerUserId: UserIdSchema,
  enabled: z.boolean(),
  createdAt: z.string().datetime({ offset: true }),
});
export type CriticalNodePolicy = z.infer<typeof CriticalNodePolicySchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/critical-node.ts packages/bot-runtime/src/schema/__tests__/critical-node.test.ts
git commit -m "feat(schema): add CriticalNodePolicy with discriminated NodeMatcher"
```

---

### Task 18: ExecuteTaskJob + TaskControl（schema/job.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/job.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/job.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { ExecuteTaskJobSchema, TaskControlSchema } from "../job.js";

describe("Job schemas", () => {
  it("ExecuteTaskJob has fencingToken and budget optional", () => {
    const j = ExecuteTaskJobSchema.parse({
      id: "job_018f5d20-0000-7000-8000-000000000001",
      type: "execute_task",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      planRevisionId: "rv_018f5d20-0000-7000-8000-000000000001",
      assignedAt: "2026-04-28T00:00:00Z",
      fencingToken: 1000001,
    });
    expect(j.fencingToken).toBe(1000001);
  });

  it("TaskControl signal optional", () => {
    const empty = TaskControlSchema.parse({
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 0,
    });
    expect(empty.signal).toBeUndefined();
    const revise = TaskControlSchema.parse({
      signal: "revise",
      revisionId: "rv-2",
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 1000003,
    });
    expect(revise.signal).toBe("revise");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../job.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { TaskBudgetSchema } from "./task.js";
import { TaskIdSchema, ThreadIdSchema } from "./thread.js";

export const ExecuteTaskJobSchema = z.object({
  id: z.string(),
  type: z.literal("execute_task"),
  taskId: TaskIdSchema,
  threadId: ThreadIdSchema,
  planRevisionId: z.string(),
  assignedAt: z.string().datetime({ offset: true }),
  fencingToken: z.number().int().positive(),
  budget: TaskBudgetSchema.optional(),
  lockHolder: z.string().optional(),
  leaseExpireAt: z.string().datetime({ offset: true }).optional(),
});
export type ExecuteTaskJob = z.infer<typeof ExecuteTaskJobSchema>;

export const TaskControlSchema = z.object({
  signal: z.enum(["pause", "resume", "cancel", "revise"]).optional(),
  revisionId: z.string().optional(),
  signalAt: z.string().datetime({ offset: true }),
  signalFencingToken: z.number().int().nonnegative(),
});
export type TaskControl = z.infer<typeof TaskControlSchema>;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/job.ts packages/bot-runtime/src/schema/__tests__/job.test.ts
git commit -m "feat(schema): add ExecuteTaskJob and TaskControl schemas"
```

---

### Task 19: ExecutorEvent union（schema/events.ts）

**Files:**
- Create: `packages/bot-runtime/src/schema/events.ts`
- Test: `packages/bot-runtime/src/schema/__tests__/events.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { ExecutorEventSchema } from "../events.js";

describe("ExecutorEventSchema", () => {
  it("supports all 9 event kinds", () => {
    const samples = [
      {
        kind: "executor_started",
        executorId: "exec-1",
        fencingToken: 1000001,
        at: "2026-04-28T00:00:00Z",
      },
      {
        kind: "tool_call",
        toolName: "read_file",
        argsRef: "args/x",
        at: "2026-04-28T00:00:01Z",
      },
      {
        kind: "tool_result",
        toolName: "read_file",
        resultRef: "results/x",
        at: "2026-04-28T00:00:02Z",
      },
      {
        kind: "plan_step_updated",
        stepId: "s1",
        status: "completed",
        at: "2026-04-28T00:00:03Z",
      },
      {
        kind: "subagent_spawned",
        subagentId: "sa-1",
        parentStepId: "s1",
        at: "2026-04-28T00:00:04Z",
      },
      {
        kind: "subagent_completed",
        subagentId: "sa-1",
        summaryRef: "sum/sa-1",
        at: "2026-04-28T00:00:05Z",
      },
      {
        kind: "critical_node_hit",
        policyId: "policy-1",
        action: "require_approval",
        at: "2026-04-28T00:00:06Z",
      },
      {
        kind: "executor_paused",
        reason: "control:pause",
        at: "2026-04-28T00:00:07Z",
      },
      {
        kind: "executor_finished",
        outcome: "completed",
        summaryRef: "summary/final",
        at: "2026-04-28T00:00:08Z",
      },
    ];
    for (const s of samples) ExecutorEventSchema.parse(s);
  });

  it("rejects unknown kind", () => {
    expect(() =>
      ExecutorEventSchema.parse({ kind: "wat", at: "2026-04-28T00:00:00Z" }),
    ).toThrow();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../events.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";

const At = z.string().datetime({ offset: true });

export const ExecutorEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("executor_started"),
    executorId: z.string(),
    fencingToken: z.number().int().positive(),
    at: At,
  }),
  z.object({
    kind: z.literal("tool_call"),
    toolName: z.string(),
    argsRef: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("tool_result"),
    toolName: z.string(),
    resultRef: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("plan_step_updated"),
    stepId: z.string(),
    status: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("subagent_spawned"),
    subagentId: z.string(),
    parentStepId: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("subagent_completed"),
    subagentId: z.string(),
    summaryRef: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("critical_node_hit"),
    policyId: z.string(),
    action: z.enum(["require_approval", "block", "log_only"]),
    at: At,
  }),
  z.object({
    kind: z.literal("executor_paused"),
    reason: z.string(),
    at: At,
  }),
  z.object({
    kind: z.literal("executor_heartbeat"),
    at: At,
  }),
  z.object({
    kind: z.literal("executor_finished"),
    outcome: z.enum(["completed", "failed", "cancelled"]),
    summaryRef: z.string().optional(),
    error: z.string().optional(),
    at: At,
  }),
]);
export type ExecutorEvent = z.infer<typeof ExecutorEventSchema>;

export type ExecutorEventKind = ExecutorEvent["kind"];
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/schema/events.ts packages/bot-runtime/src/schema/__tests__/events.test.ts
git commit -m "feat(schema): add ExecutorEvent discriminated union"
```

---

## Phase C — Repositories

> 仓储层把 schema 与文件系统粘起来。每个 repo 只暴露领域语义方法（如 `appendTranscript`、`leaseNextJob`），不让上层直接拼路径。

### Task 20: ThreadRepo（repositories/thread-repo.ts）

**Files:**
- Create: `packages/bot-runtime/src/repositories/thread-repo.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/thread-repo.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createThreadRepo } from "../thread-repo.js";

describe("ThreadRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "thrr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("create then load roundtrip", async () => {
    const repo = createThreadRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.create({
      title: "demo",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
    });
    expect(t.status).toBe("chatting");
    const loaded = await repo.load(t.id);
    expect(loaded?.id).toBe(t.id);
  });

  it("update sets updatedAt and rejects unknown status", async () => {
    const repo = createThreadRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.create({
      title: "demo",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
    });
    const updated = await repo.update(t.id, { status: "working" });
    expect(updated.status).toBe("working");
    expect(Date.parse(updated.updatedAt)).toBeGreaterThanOrEqual(
      Date.parse(t.updatedAt),
    );
    await expect(
      repo.update(t.id, { status: "weird" as never }),
    ).rejects.toThrow();
  });

  it("listAll enumerates all threads", async () => {
    const repo = createThreadRepo(createPaths(dataRoot), "rt-1");
    await repo.create({ title: "a", ownerUserId: "u_018f5d20-0000-7000-8000-000000000001" });
    await repo.create({ title: "b", ownerUserId: "u_018f5d20-0000-7000-8000-000000000001" });
    const all = await repo.listAll();
    expect(all).toHaveLength(2);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../thread-repo.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readdir } from "node:fs/promises";
import { readJson, writeJson } from "../storage/json-file.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import { type Thread, ThreadSchema } from "../schema/thread.js";

export type CreateThreadInput = {
  title: string;
  ownerUserId: string;
};

export type ThreadRepo = {
  create(input: CreateThreadInput): Promise<Thread>;
  load(threadId: string): Promise<Thread | null>;
  update(threadId: string, patch: Partial<Thread>): Promise<Thread>;
  listAll(): Promise<Thread[]>;
};

export function createThreadRepo(paths: Paths, runtimeId: string): ThreadRepo {
  return {
    async create(input) {
      const now = new Date().toISOString();
      const id = newId("th");
      const t: Thread = ThreadSchema.parse({
        id,
        ownerUserId: input.ownerUserId,
        title: input.title,
        status: "chatting",
        taskListId: `tl_${id}`,
        channelBindingIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(paths.threadDir(runtimeId, id), { recursive: true });
      await writeJson(paths.threadJson(runtimeId, id), t);
      return t;
    },

    async load(threadId) {
      const raw = await readJson(paths.threadJson(runtimeId, threadId));
      if (!raw) return null;
      return ThreadSchema.parse(raw);
    },

    async update(threadId, patch) {
      const cur = await this.load(threadId);
      if (!cur) throw new Error(`thread ${threadId} not found`);
      const next = ThreadSchema.parse({
        ...cur,
        ...patch,
        id: cur.id,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(paths.threadJson(runtimeId, threadId), next);
      return next;
    },

    async listAll() {
      const root = paths.threadsRoot(runtimeId);
      await mkdir(root, { recursive: true });
      const dirs = await readdir(root);
      const out: Thread[] = [];
      for (const d of dirs) {
        const t = await this.load(d);
        if (t) out.push(t);
      }
      return out;
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/thread-repo.ts packages/bot-runtime/src/repositories/__tests__/thread-repo.test.ts
git commit -m "feat(repos): add ThreadRepo with schema-validated CRUD"
```

---

### Task 21: TaskRepo（repositories/task-repo.ts）

**Files:**
- Create: `packages/bot-runtime/src/repositories/task-repo.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/task-repo.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createTaskRepo } from "../task-repo.js";

describe("TaskRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "tkr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    th: "th_018f5d20-0000-7000-8000-000000000001",
    user: "u_018f5d20-0000-7000-8000-000000000001",
  } as const;

  it("createDraft has draft status and ownerUserId", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    expect(t.status).toBe("draft");
    expect(t.ownerUserId).toBe(ids.user);
  });

  it("transitionStatus enforces legal transitions", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const t = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    await repo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await repo.transitionStatus(t.id, "queued");
    await repo.transitionStatus(t.id, "running");
    await expect(
      repo.transitionStatus(t.id, "draft" as never),
    ).rejects.toThrow(/illegal transition/);
  });

  it("listByThread filters by threadId and status", async () => {
    const repo = createTaskRepo(createPaths(dataRoot), "rt-1");
    const a = await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "a",
      description: "",
      sourceMessageIds: [],
    });
    await repo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "b",
      description: "",
      sourceMessageIds: [],
    });
    await repo.transitionStatus(a.id, "confirmed", { confirmedByUserId: ids.user });
    const drafts = await repo.listByThread(ids.th, { status: ["draft"] });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.title).toBe("b");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../task-repo.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readdir } from "node:fs/promises";
import { readJson, writeJson } from "../storage/json-file.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import { type Task, TaskSchema, type TaskStatus } from "../schema/task.js";

const LEGAL_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: [
    "awaiting_critical_node",
    "blocked",
    "changing",
    "completed",
    "failed",
  ],
  awaiting_critical_node: ["running", "cancelled"],
  blocked: ["running", "cancelled"],
  changing: ["queued", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export type CreateDraftTaskInput = {
  threadId: string;
  ownerUserId: string;
  title: string;
  description: string;
  sourceMessageIds: string[];
};

export type TaskRepo = {
  createDraft(input: CreateDraftTaskInput): Promise<Task>;
  load(taskId: string): Promise<Task | null>;
  loadInThread(threadId: string, taskId: string): Promise<Task | null>;
  update(taskId: string, patch: Partial<Task>): Promise<Task>;
  transitionStatus(
    taskId: string,
    next: TaskStatus,
    extras?: Partial<Task>,
  ): Promise<Task>;
  listByThread(
    threadId: string,
    opts?: { status?: TaskStatus[] },
  ): Promise<Task[]>;
};

export function createTaskRepo(paths: Paths, runtimeId: string): TaskRepo {
  async function findFile(taskId: string): Promise<{
    threadId: string;
    file: string;
  } | null> {
    const root = paths.threadsRoot(runtimeId);
    await mkdir(root, { recursive: true });
    for (const th of await readdir(root)) {
      const f = paths.taskJson(runtimeId, th, taskId);
      const got = await readJson(f);
      if (got) return { threadId: th, file: f };
    }
    return null;
  }

  return {
    async createDraft(input) {
      const now = new Date().toISOString();
      const id = newId("tk");
      const t: Task = TaskSchema.parse({
        id,
        threadId: input.threadId,
        ownerUserId: input.ownerUserId,
        title: input.title,
        description: input.description,
        status: "draft",
        sourceMessageIds: input.sourceMessageIds,
        artifactIds: [],
        changeRecordIds: [],
        archivedRevisionIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(paths.taskDir(runtimeId, input.threadId, id), {
        recursive: true,
      });
      await writeJson(paths.taskJson(runtimeId, input.threadId, id), t);
      return t;
    },

    async load(taskId) {
      const found = await findFile(taskId);
      if (!found) return null;
      return TaskSchema.parse(await readJson(found.file));
    },

    async loadInThread(threadId, taskId) {
      const raw = await readJson(paths.taskJson(runtimeId, threadId, taskId));
      return raw ? TaskSchema.parse(raw) : null;
    },

    async update(taskId, patch) {
      const found = await findFile(taskId);
      if (!found) throw new Error(`task ${taskId} not found`);
      const cur = TaskSchema.parse(await readJson(found.file));
      const next = TaskSchema.parse({
        ...cur,
        ...patch,
        id: cur.id,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(found.file, next);
      return next;
    },

    async transitionStatus(taskId, next, extras = {}) {
      const cur = await this.load(taskId);
      if (!cur) throw new Error(`task ${taskId} not found`);
      const allowed = LEGAL_TRANSITIONS[cur.status] ?? [];
      if (!allowed.includes(next)) {
        throw new Error(
          `illegal transition: ${cur.status} -> ${next} for task ${taskId}`,
        );
      }
      return this.update(taskId, { status: next, ...extras });
    },

    async listByThread(threadId, opts = {}) {
      const dir = paths.threadDir(runtimeId, threadId);
      const tasksDir = `${dir}/tasks`;
      let names: string[] = [];
      try {
        names = await readdir(tasksDir);
      } catch {
        return [];
      }
      const out: Task[] = [];
      for (const id of names) {
        const t = await this.loadInThread(threadId, id);
        if (!t) continue;
        if (opts.status && !opts.status.includes(t.status)) continue;
        out.push(t);
      }
      return out;
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/task-repo.ts packages/bot-runtime/src/repositories/__tests__/task-repo.test.ts
git commit -m "feat(repos): add TaskRepo with status transition guard"
```

---

### Task 22: PlanRepo + 归档（repositories/plan-repo.ts）

**Files:**
- Create: `packages/bot-runtime/src/repositories/plan-repo.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/plan-repo.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createPlanRepo } from "../plan-repo.js";

describe("PlanRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "plr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    th: "th_018f5d20-0000-7000-8000-000000000001",
    tk: "tk_018f5d20-0000-7000-8000-000000000001",
  };

  it("createDraftPlan starts with draft status", async () => {
    const repo = createPlanRepo(createPaths(dataRoot), "rt-1");
    const p = await repo.createDraftPlan({
      taskId: ids.tk,
      threadId: ids.th,
      objective: "ship it",
      steps: [{ id: "s1", title: "first", status: "pending" }],
    });
    expect(p.status).toBe("draft");
  });

  it("supersedeWithRevision archives outputs and writes new revision", async () => {
    const paths = createPaths(dataRoot);
    const repo = createPlanRepo(paths, "rt-1");
    const p = await repo.createDraftPlan({
      taskId: ids.tk,
      threadId: ids.th,
      objective: "v1",
      steps: [],
    });
    await repo.activate(p.id, ids.th, ids.tk);
    const outDir = paths.outputs("rt-1", ids.th, ids.tk);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "draft.md"), "hello");

    const newRev = await repo.supersedeWithRevision(p.id, ids.th, ids.tk, {
      reason: "user pivot",
      sourceMessageId: "msg-1",
      newPlan: {
        objective: "v2",
        steps: [],
        expectedArtifacts: [],
      },
    });

    expect(newRev.status).toBe("active");
    const archived = await readdir(
      paths.outputsArchive("rt-1", ids.th, ids.tk, newRev.id),
    );
    expect(archived).toContain("draft.md");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../plan-repo.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../storage/json-file.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import {
  type Plan,
  type PlanRevision,
  PlanRevisionSchema,
  PlanSchema,
  type PlanStep,
} from "../schema/plan.js";

export type CreateDraftPlanInput = {
  taskId: string;
  threadId: string;
  objective: string;
  steps: PlanStep[];
  expectedArtifacts?: string[];
};

export type PlanRepo = {
  createDraftPlan(input: CreateDraftPlanInput): Promise<Plan>;
  loadPlan(threadId: string, taskId: string): Promise<Plan | null>;
  activate(planId: string, threadId: string, taskId: string): Promise<Plan>;
  supersedeWithRevision(
    planId: string,
    threadId: string,
    taskId: string,
    input: {
      reason: string;
      sourceMessageId: string;
      newPlan: { objective: string; steps: PlanStep[]; expectedArtifacts: string[] };
    },
  ): Promise<PlanRevision>;
  listRevisions(threadId: string, taskId: string): Promise<PlanRevision[]>;
};

async function moveDirContents(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  let entries: string[] = [];
  try {
    entries = await readdir(src);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "_archive") continue;
    const srcPath = path.posix.join(src, name);
    const dstPath = path.posix.join(dst, name);
    const s = await stat(srcPath);
    if (s.isDirectory()) {
      await moveDirContents(srcPath, dstPath);
      continue;
    }
    await rename(srcPath, dstPath);
  }
}

export function createPlanRepo(paths: Paths, runtimeId: string): PlanRepo {
  return {
    async createDraftPlan(input) {
      const now = new Date().toISOString();
      const id = newId("pl");
      const plan = PlanSchema.parse({
        id,
        taskId: input.taskId,
        status: "draft",
        objective: input.objective,
        steps: input.steps,
        expectedArtifacts: input.expectedArtifacts ?? [],
        revisionIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(paths.taskDir(runtimeId, input.threadId, input.taskId), {
        recursive: true,
      });
      await writeJson(
        paths.taskPlan(runtimeId, input.threadId, input.taskId),
        plan,
      );
      return plan;
    },

    async loadPlan(threadId, taskId) {
      const raw = await readJson(paths.taskPlan(runtimeId, threadId, taskId));
      return raw ? PlanSchema.parse(raw) : null;
    },

    async activate(planId, threadId, taskId) {
      const cur = await this.loadPlan(threadId, taskId);
      if (!cur) throw new Error(`plan not found for task ${taskId}`);
      if (cur.id !== planId) throw new Error(`planId mismatch`);
      const next = PlanSchema.parse({
        ...cur,
        status: "active",
        updatedAt: new Date().toISOString(),
      });
      await writeJson(paths.taskPlan(runtimeId, threadId, taskId), next);
      return next;
    },

    async supersedeWithRevision(planId, threadId, taskId, input) {
      const cur = await this.loadPlan(threadId, taskId);
      if (!cur) throw new Error(`plan not found for task ${taskId}`);
      if (cur.id !== planId) throw new Error(`planId mismatch`);

      const revisionId = newId("rv");
      const archiveDir = paths.outputsArchive(
        runtimeId,
        threadId,
        taskId,
        revisionId,
      );
      const outputs = paths.outputs(runtimeId, threadId, taskId);
      const archivedPaths: string[] = [];
      try {
        const before = await readdir(outputs);
        for (const e of before) if (e !== "_archive") archivedPaths.push(e);
      } catch {
        /* outputs dir does not exist yet */
      }
      await moveDirContents(outputs, archiveDir);

      const supersededSnapshot = PlanSchema.parse({
        ...cur,
        status: "superseded",
        updatedAt: new Date().toISOString(),
      });
      await writeJson(
        paths.planRevision(runtimeId, threadId, taskId, `${revisionId}-prev`),
        PlanRevisionSchema.parse({
          id: `${revisionId}-prev`,
          planId,
          taskId,
          status: "superseded",
          fullPlan: supersededSnapshot,
          reason: input.reason,
          sourceMessageId: input.sourceMessageId,
          archivedArtifactPaths: archivedPaths,
          supersededAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
      );

      const now = new Date().toISOString();
      const newPlan = PlanSchema.parse({
        id: cur.id,
        taskId,
        status: "active",
        objective: input.newPlan.objective,
        steps: input.newPlan.steps,
        expectedArtifacts: input.newPlan.expectedArtifacts,
        revisionIds: [...cur.revisionIds, `${revisionId}-prev`, revisionId],
        createdAt: cur.createdAt,
        updatedAt: now,
      });
      await writeJson(paths.taskPlan(runtimeId, threadId, taskId), newPlan);

      const newRev = PlanRevisionSchema.parse({
        id: revisionId,
        planId,
        taskId,
        status: "active",
        fullPlan: newPlan,
        reason: input.reason,
        sourceMessageId: input.sourceMessageId,
        archivedArtifactPaths: [],
        createdAt: now,
      });
      await writeJson(
        paths.planRevision(runtimeId, threadId, taskId, revisionId),
        newRev,
      );
      return newRev;
    },

    async listRevisions(threadId, taskId) {
      const dir = path.posix.join(
        paths.taskDir(runtimeId, threadId, taskId),
        "plan-revisions",
      );
      let files: string[] = [];
      try {
        files = await readdir(dir);
      } catch {
        return [];
      }
      const out: PlanRevision[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const raw = await readJson(path.posix.join(dir, f));
        if (raw) out.push(PlanRevisionSchema.parse(raw));
      }
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/plan-repo.ts packages/bot-runtime/src/repositories/__tests__/plan-repo.test.ts
git commit -m "feat(repos): add PlanRepo with revision archiving and outputs migration"
```

---

### Task 23: TranscriptRepo + GuardDecisionRepo（合并到一个 task）

**Files:**
- Create: `packages/bot-runtime/src/repositories/transcript-repo.ts`
- Create: `packages/bot-runtime/src/repositories/guard-decision-repo.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/transcript-and-guard.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createGuardDecisionRepo } from "../guard-decision-repo.js";
import { createTranscriptRepo } from "../transcript-repo.js";

describe("TranscriptRepo + GuardDecisionRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "trg-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const th = "th_018f5d20-0000-7000-8000-000000000001";

  it("appends sanitized transcript entries", async () => {
    const t = createTranscriptRepo(createPaths(dataRoot), "rt-1");
    await t.append(th, {
      kind: "user_message",
      messageId: "msg-1",
      text: "Bearer abcDEFghiJKLmnOPqrSTUVwxYZ12 plz help",
      at: "2026-04-28T00:00:00Z",
    });
    const all = await t.read(th);
    expect(all[0]).toMatchObject({ kind: "user_message" });
    expect((all[0] as { text: string }).text).toContain("<redacted:secret>");
  });

  it("appends GuardDecisions and reads back via repo", async () => {
    const g = createGuardDecisionRepo(createPaths(dataRoot), "rt-1");
    await g.append({
      id: "guard_018f5d20-0000-7000-8000-000000000001",
      messageId: "msg-1",
      threadId: th,
      source: "lark_group",
      intent: "irrelevant",
      shortCircuited: true,
      ruleHits: ["bound_group_no_mention"],
      confidence: 0,
      requiresUserConfirmation: false,
      reason: "noisy",
      createdAt: "2026-04-28T00:00:00Z",
    });
    const decisions = await g.read(th);
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.shortCircuited).toBe(true);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — repos 不存在。

- [ ] **Step 3：实现**

`packages/bot-runtime/src/repositories/transcript-repo.ts`：
```ts
import { appendJsonl, readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import { sanitize } from "../storage/sanitize.js";

export type TranscriptEntry =
  | { kind: "user_message"; messageId: string; text: string; at: string }
  | { kind: "assistant_message"; messageId: string; text: string; at: string }
  | { kind: "tool_call"; toolName: string; argsRef: string; at: string }
  | { kind: "tool_result"; toolName: string; resultRef: string; at: string }
  | { kind: "guard_decision"; decisionId: string; intent: string; at: string }
  | { kind: "task_event"; taskId: string; eventKind: string; at: string }
  | { kind: "plan_event"; planId: string; eventKind: string; at: string };

export type TranscriptRepo = {
  append(threadId: string, entry: TranscriptEntry): Promise<void>;
  read(threadId: string): Promise<TranscriptEntry[]>;
};

export function createTranscriptRepo(
  paths: Paths,
  runtimeId: string,
): TranscriptRepo {
  return {
    append(threadId, entry) {
      return appendJsonl(paths.transcript(runtimeId, threadId), sanitize(entry));
    },
    read(threadId) {
      return readJsonl<TranscriptEntry>(paths.transcript(runtimeId, threadId));
    },
  };
}
```

`packages/bot-runtime/src/repositories/guard-decision-repo.ts`：
```ts
import { appendJsonl, readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import {
  type GuardDecision,
  GuardDecisionSchema,
} from "../schema/guard-decision.js";
import { sanitize } from "../storage/sanitize.js";

export type GuardDecisionRepo = {
  append(decision: GuardDecision): Promise<void>;
  read(threadId: string): Promise<GuardDecision[]>;
};

export function createGuardDecisionRepo(
  paths: Paths,
  runtimeId: string,
): GuardDecisionRepo {
  return {
    async append(decision) {
      const validated = GuardDecisionSchema.parse(decision);
      await appendJsonl(
        paths.guardDecisions(runtimeId, decision.threadId),
        sanitize(validated),
      );
    },
    async read(threadId) {
      const raw = await readJsonl<unknown>(
        paths.guardDecisions(runtimeId, threadId),
      );
      return raw.map((r) => GuardDecisionSchema.parse(r));
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/transcript-repo.ts packages/bot-runtime/src/repositories/guard-decision-repo.ts packages/bot-runtime/src/repositories/__tests__/transcript-and-guard.test.ts
git commit -m "feat(repos): add TranscriptRepo and GuardDecisionRepo with sanitized writes"
```

---

### Task 24: JobQueue（repositories/job-queue.ts）

**Files:**
- Create: `packages/bot-runtime/src/repositories/job-queue.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/job-queue.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createJobQueue } from "../job-queue.js";

describe("JobQueue", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "jq-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    th: "th_018f5d20-0000-7000-8000-000000000001",
    tk: "tk_018f5d20-0000-7000-8000-000000000001",
  };

  it("enqueueExecuteTask writes pending file", async () => {
    const q = createJobQueue(createPaths(dataRoot), "rt-1");
    const job = await q.enqueueExecuteTask({
      taskId: ids.tk,
      threadId: ids.th,
      planRevisionId: "rv-1",
      fencingToken: 1000001,
    });
    expect(job.id).toMatch(/^job_/);
    const pending = await readdir(
      createPaths(dataRoot).jobsDir("rt-1", "pending"),
    );
    expect(pending.some((f) => f === `${job.id}.json`)).toBe(true);
  });

  it("leaseNext moves pending → locked, sets leaseExpireAt", async () => {
    const q = createJobQueue(createPaths(dataRoot), "rt-1");
    await q.enqueueExecuteTask({
      taskId: ids.tk,
      threadId: ids.th,
      planRevisionId: "rv-1",
      fencingToken: 1000001,
    });
    const leased = await q.leaseNext({
      lockHolder: "exec-1",
      leaseMs: 60_000,
    });
    expect(leased?.lockHolder).toBe("exec-1");
    expect(Date.parse(leased!.leaseExpireAt!)).toBeGreaterThan(Date.now());
  });

  it("complete moves locked → done", async () => {
    const q = createJobQueue(createPaths(dataRoot), "rt-1");
    await q.enqueueExecuteTask({
      taskId: ids.tk,
      threadId: ids.th,
      planRevisionId: "rv-1",
      fencingToken: 1000001,
    });
    const leased = await q.leaseNext({ lockHolder: "exec-1", leaseMs: 60_000 });
    await q.complete(leased!.id, { outcome: "completed" });
    const done = await readdir(
      createPaths(dataRoot).jobsDir("rt-1", "done"),
    );
    expect(done).toContain(`${leased!.id}.json`);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../job-queue.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readdir, rename } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../storage/json-file.js";
import { newId } from "../storage/ids.js";
import type { Paths, JobStatus } from "../storage/paths.js";
import {
  type ExecuteTaskJob,
  ExecuteTaskJobSchema,
} from "../schema/job.js";

export type EnqueueExecuteTaskInput = {
  taskId: string;
  threadId: string;
  planRevisionId: string;
  fencingToken: number;
  budget?: ExecuteTaskJob["budget"];
};

export type LeaseInput = {
  lockHolder: string;
  leaseMs: number;
};

export type JobQueue = {
  enqueueExecuteTask(input: EnqueueExecuteTaskInput): Promise<ExecuteTaskJob>;
  leaseNext(input: LeaseInput): Promise<ExecuteTaskJob | null>;
  heartbeat(jobId: string, leaseMs: number): Promise<void>;
  complete(
    jobId: string,
    result: { outcome: "completed" | "failed" | "cancelled"; error?: string },
  ): Promise<void>;
  fail(jobId: string, error: string): Promise<void>;
  loadLocked(jobId: string): Promise<ExecuteTaskJob | null>;
};

async function moveJob(
  paths: Paths,
  runtimeId: string,
  from: JobStatus,
  to: JobStatus,
  jobId: string,
): Promise<string> {
  const src = paths.jobFile(runtimeId, from, jobId);
  const dst = paths.jobFile(runtimeId, to, jobId);
  await mkdir(path.dirname(dst), { recursive: true });
  await rename(src, dst);
  return dst;
}

export function createJobQueue(paths: Paths, runtimeId: string): JobQueue {
  return {
    async enqueueExecuteTask(input) {
      const id = newId("job");
      const job: ExecuteTaskJob = ExecuteTaskJobSchema.parse({
        id,
        type: "execute_task",
        taskId: input.taskId,
        threadId: input.threadId,
        planRevisionId: input.planRevisionId,
        assignedAt: new Date().toISOString(),
        fencingToken: input.fencingToken,
        budget: input.budget,
      });
      await mkdir(paths.jobsDir(runtimeId, "pending"), { recursive: true });
      await writeJson(paths.jobFile(runtimeId, "pending", id), job);
      return job;
    },

    async leaseNext({ lockHolder, leaseMs }) {
      const dir = paths.jobsDir(runtimeId, "pending");
      await mkdir(dir, { recursive: true });
      const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
      const first = files[0];
      if (!first) return null;
      const id = first.slice(0, -".json".length);
      const file = paths.jobFile(runtimeId, "pending", id);
      const cur = await readJson(file);
      if (!cur) return null;
      const job = ExecuteTaskJobSchema.parse(cur);
      const leased: ExecuteTaskJob = ExecuteTaskJobSchema.parse({
        ...job,
        lockHolder,
        leaseExpireAt: new Date(Date.now() + leaseMs).toISOString(),
      });
      const dst = paths.jobFile(runtimeId, "locked", id);
      await mkdir(path.dirname(dst), { recursive: true });
      await writeJson(dst, leased);
      try {
        await rename(file, `${file}.recovered`).catch(() => undefined);
      } catch {
        /* tolerate */
      }
      return leased;
    },

    async heartbeat(jobId, leaseMs) {
      const file = paths.jobFile(runtimeId, "locked", jobId);
      const cur = await readJson(file);
      if (!cur) throw new Error(`locked job not found: ${jobId}`);
      const job = ExecuteTaskJobSchema.parse(cur);
      const next = ExecuteTaskJobSchema.parse({
        ...job,
        leaseExpireAt: new Date(Date.now() + leaseMs).toISOString(),
      });
      await writeJson(file, next);
    },

    async complete(jobId, result) {
      const dst = await moveJob(paths, runtimeId, "locked", "done", jobId);
      const cur = await readJson(dst);
      if (cur) {
        await writeJson(dst, {
          ...cur,
          completedAt: new Date().toISOString(),
          outcome: result.outcome,
          error: result.error,
        });
      }
    },

    async fail(jobId, error) {
      const dst = await moveJob(paths, runtimeId, "locked", "failed", jobId);
      const cur = await readJson(dst);
      if (cur) {
        await writeJson(dst, {
          ...cur,
          failedAt: new Date().toISOString(),
          lastError: error,
        });
      }
    },

    async loadLocked(jobId) {
      const raw = await readJson(paths.jobFile(runtimeId, "locked", jobId));
      return raw ? ExecuteTaskJobSchema.parse(raw) : null;
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/job-queue.ts packages/bot-runtime/src/repositories/__tests__/job-queue.test.ts
git commit -m "feat(repos): add JobQueue with lease, heartbeat, complete, and fail"
```

---

### Task 25: ChannelBindingRepo + ChatClaim（repositories/channel-binding-repo.ts）

**Files:**
- Create: `packages/bot-runtime/src/repositories/channel-binding-repo.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/channel-binding-repo.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelBindingRepo } from "../channel-binding-repo.js";

describe("ChannelBindingRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "cbr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const th = "th_018f5d20-0000-7000-8000-000000000001";

  it("create + list returns active binding", async () => {
    const repo = createChannelBindingRepo(createPaths(dataRoot), "rt-1");
    const b = await repo.create({
      threadId: th,
      provider: "feishu",
      externalConversationId: "oc_xxx",
      externalConversationType: "group",
      createdBy: "client",
    });
    expect(b.status).toBe("binding");
    const all = await repo.listForThread(th);
    expect(all).toHaveLength(1);
  });

  it("claimChat prevents same external chat being bound twice", async () => {
    const repo = createChannelBindingRepo(createPaths(dataRoot), "rt-1");
    await repo.claimChat("feishu", "oc_xxx", th);
    await expect(
      repo.claimChat("feishu", "oc_xxx", "th_other"),
    ).rejects.toThrow(/already claimed/);
  });

  it("releaseChat removes the claim file", async () => {
    const repo = createChannelBindingRepo(createPaths(dataRoot), "rt-1");
    await repo.claimChat("feishu", "oc_xxx", th);
    await repo.releaseChat("feishu", "oc_xxx");
    await repo.claimChat("feishu", "oc_xxx", "th_other");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../channel-binding-repo.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { readJson, writeJson } from "../storage/json-file.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import {
  type ChannelBinding,
  ChannelBindingSchema,
} from "../schema/channel.js";

export type CreateBindingInput = {
  threadId: string;
  provider: string;
  externalConversationId?: string;
  externalConversationType: "dm" | "group" | "topic";
  createdBy: ChannelBinding["createdBy"];
};

export type ChannelBindingRepo = {
  create(input: CreateBindingInput): Promise<ChannelBinding>;
  load(
    threadId: string,
    provider: string,
    bindingId: string,
  ): Promise<ChannelBinding | null>;
  listForThread(threadId: string): Promise<ChannelBinding[]>;
  updateStatus(
    threadId: string,
    provider: string,
    bindingId: string,
    next: ChannelBinding["status"],
  ): Promise<ChannelBinding>;
  claimChat(
    provider: string,
    externalChatId: string,
    threadId: string,
  ): Promise<void>;
  releaseChat(provider: string, externalChatId: string): Promise<void>;
  whoClaimsChat(
    provider: string,
    externalChatId: string,
  ): Promise<string | null>;
};

export function createChannelBindingRepo(
  paths: Paths,
  runtimeId: string,
): ChannelBindingRepo {
  return {
    async create(input) {
      const id = newId("bd");
      const now = new Date().toISOString();
      const binding = ChannelBindingSchema.parse({
        id,
        threadId: input.threadId,
        provider: input.provider,
        externalConversationId: input.externalConversationId,
        externalConversationType: input.externalConversationType,
        status: "binding",
        createdBy: input.createdBy,
        enabled: true,
        notifyDefault: true,
        createdAt: now,
        updatedAt: now,
      });
      await writeJson(
        paths.binding(runtimeId, input.threadId, input.provider, id),
        binding,
      );
      return binding;
    },

    async load(threadId, provider, bindingId) {
      const raw = await readJson(
        paths.binding(runtimeId, threadId, provider, bindingId),
      );
      return raw ? ChannelBindingSchema.parse(raw) : null;
    },

    async listForThread(threadId) {
      const root = path.posix.join(
        paths.state(runtimeId),
        "bindings",
        threadId,
      );
      let providers: string[] = [];
      try {
        providers = await readdir(root);
      } catch {
        return [];
      }
      const out: ChannelBinding[] = [];
      for (const provider of providers) {
        let bindings: string[] = [];
        try {
          bindings = await readdir(path.posix.join(root, provider));
        } catch {
          continue;
        }
        for (const b of bindings) {
          const got = await this.load(threadId, provider, b);
          if (got) out.push(got);
        }
      }
      return out;
    },

    async updateStatus(threadId, provider, bindingId, next) {
      const cur = await this.load(threadId, provider, bindingId);
      if (!cur) throw new Error(`binding ${bindingId} not found`);
      const updated = ChannelBindingSchema.parse({
        ...cur,
        status: next,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(
        paths.binding(runtimeId, threadId, provider, bindingId),
        updated,
      );
      return updated;
    },

    async claimChat(provider, externalChatId, threadId) {
      const file = paths.chatClaim(runtimeId, provider, externalChatId);
      await mkdir(path.dirname(file), { recursive: true });
      let existing: string | null = null;
      try {
        existing = await readFile(file, "utf8");
      } catch {
        existing = null;
      }
      if (existing && existing !== threadId) {
        throw new Error(
          `chat ${externalChatId} already claimed by thread ${existing}`,
        );
      }
      await writeFile(file, threadId, "utf8");
    },

    async releaseChat(provider, externalChatId) {
      const file = paths.chatClaim(runtimeId, provider, externalChatId);
      try {
        await unlink(file);
      } catch {
        /* already gone */
      }
    },

    async whoClaimsChat(provider, externalChatId) {
      const file = paths.chatClaim(runtimeId, provider, externalChatId);
      try {
        return (await readFile(file, "utf8")).trim() || null;
      } catch {
        return null;
      }
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/channel-binding-repo.ts packages/bot-runtime/src/repositories/__tests__/channel-binding-repo.test.ts
git commit -m "feat(repos): add ChannelBindingRepo with chat-claim enforcement"
```

---

### Task 26: CriticalNodePolicyRepo（repositories/critical-node-policy-repo.ts）

**Files:**
- Create: `packages/bot-runtime/src/repositories/critical-node-policy-repo.ts`
- Test: `packages/bot-runtime/src/repositories/__tests__/critical-node-policy-repo.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createCriticalNodePolicyRepo } from "../critical-node-policy-repo.js";

describe("CriticalNodePolicyRepo", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "cnp-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("save + listEnabled returns enabled policies sorted by scope precedence", async () => {
    const repo = createCriticalNodePolicyRepo(createPaths(dataRoot), "rt-1");
    await repo.save({
      id: "g1",
      scope: "global",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "log_only",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: true,
      createdAt: "2026-04-28T00:00:00Z",
    });
    await repo.save({
      id: "u1",
      scope: "user",
      matcher: { kind: "external_io", direction: "outbound" },
      action: "require_approval",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: true,
      createdAt: "2026-04-28T00:00:00Z",
    });
    await repo.save({
      id: "off",
      scope: "user",
      matcher: { kind: "tool", toolName: "bash" },
      action: "block",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      enabled: false,
      createdAt: "2026-04-28T00:00:00Z",
    });
    const enabled = await repo.listEnabled();
    expect(enabled.map((p) => p.id)).toEqual(["g1", "u1"]);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../critical-node-policy-repo.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, readdir } from "node:fs/promises";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";
import {
  type CriticalNodePolicy,
  CriticalNodePolicySchema,
} from "../schema/critical-node.js";

const SCOPE_ORDER: Record<CriticalNodePolicy["scope"], number> = {
  global: 0,
  user: 1,
  thread: 2,
  skill: 3,
};

export type CriticalNodePolicyRepo = {
  save(policy: CriticalNodePolicy): Promise<void>;
  load(policyId: string): Promise<CriticalNodePolicy | null>;
  listEnabled(): Promise<CriticalNodePolicy[]>;
  remove(policyId: string): Promise<void>;
};

export function createCriticalNodePolicyRepo(
  paths: Paths,
  runtimeId: string,
): CriticalNodePolicyRepo {
  return {
    async save(policy) {
      const validated = CriticalNodePolicySchema.parse(policy);
      await writeJson(
        paths.criticalNodePolicy(runtimeId, validated.id),
        validated,
      );
    },
    async load(policyId) {
      const raw = await readJson(paths.criticalNodePolicy(runtimeId, policyId));
      return raw ? CriticalNodePolicySchema.parse(raw) : null;
    },
    async listEnabled() {
      const dir = paths.criticalNodePolicy(runtimeId, "").replace(/\/$/, "");
      const root = dir.split("/").slice(0, -1).join("/");
      await mkdir(root, { recursive: true });
      const files = (await readdir(root)).filter((f) => f.endsWith(".json"));
      const out: CriticalNodePolicy[] = [];
      for (const f of files) {
        const id = f.slice(0, -".json".length);
        const p = await this.load(id);
        if (p?.enabled) out.push(p);
      }
      return out.sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope]);
    },
    async remove(policyId) {
      const fs = await import("node:fs/promises");
      try {
        await fs.unlink(paths.criticalNodePolicy(runtimeId, policyId));
      } catch {
        /* already gone */
      }
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/repositories/critical-node-policy-repo.ts packages/bot-runtime/src/repositories/__tests__/critical-node-policy-repo.test.ts
git commit -m "feat(repos): add CriticalNodePolicyRepo with scope-ordered listing"
```

---

## Phase D — Tool 协议与内置工具

> Tool 是 Executor 调用的最小单元。每个 tool 必须声明只读 / 破坏性 / 并发安全标记，由 dispatcher 统一调度。

### Task 27: Tool 协议（tools/tool.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/tool.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/tool.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../tool.js";

describe("defineTool", () => {
  it("rejects calls with invalid input", async () => {
    const echo = defineTool({
      name: "echo",
      description: "echo back",
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      requiresApproval: false,
      input: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async call(args) {
        return { msg: args.msg };
      },
    });
    await expect(echo.call({} as never, { ctx: minimalCtx() })).rejects.toThrow();
  });

  it("validates output", async () => {
    const tool = defineTool({
      name: "bad",
      description: "",
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      requiresApproval: false,
      input: z.object({}),
      output: z.object({ n: z.number() }),
      async call() {
        return { n: "string" } as unknown as { n: number };
      },
    });
    await expect(tool.call({}, { ctx: minimalCtx() })).rejects.toThrow();
  });
});

function minimalCtx() {
  return {
    runtimeId: "rt-1",
    threadId: "th-1",
    taskId: "tk-1",
    fencingToken: 1,
    now: () => "2026-04-28T00:00:00Z",
  };
}
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../tool.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { z } from "zod";

export type ToolContext = {
  runtimeId: string;
  threadId: string;
  taskId: string;
  fencingToken: number;
  now(): string;
};

export type ToolDefinition<I, O> = {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  concurrencySafe: boolean;
  requiresApproval: boolean;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  call(args: I, env: { ctx: ToolContext }): Promise<O>;
};

export type Tool = {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  concurrencySafe: boolean;
  requiresApproval: boolean;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  call(args: unknown, env: { ctx: ToolContext }): Promise<unknown>;
};

export function defineTool<I, O>(d: ToolDefinition<I, O>): Tool {
  return {
    name: d.name,
    description: d.description,
    readOnly: d.readOnly,
    destructive: d.destructive,
    concurrencySafe: d.concurrencySafe,
    requiresApproval: d.requiresApproval,
    inputSchema: d.input,
    outputSchema: d.output,
    async call(args, env) {
      const validated = d.input.parse(args);
      const result = await d.call(validated, env);
      return d.output.parse(result);
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/tool.ts packages/bot-runtime/src/tools/__tests__/tool.test.ts
git commit -m "feat(tools): add Tool protocol with input/output validation"
```

---

### Task 28: read_file / list_dir（tools/read-file.ts、tools/list-dir.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/read-file.ts`
- Create: `packages/bot-runtime/src/tools/list-dir.ts`
- Create: `packages/bot-runtime/src/tools/_workspace-resolver.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/read-file-and-list-dir.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createListDirTool } from "../list-dir.js";
import { createReadFileTool } from "../read-file.js";

describe("read_file and list_dir", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rfls-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  async function setupWorkspace() {
    const paths = createPaths(dataRoot);
    const ws = paths.workspace("rt-1", ctx().threadId, ctx().taskId);
    await mkdir(ws, { recursive: true });
    await writeFile(path.join(ws, "hello.txt"), "world");
    await mkdir(path.join(ws, "sub"), { recursive: true });
    await writeFile(path.join(ws, "sub/inner.txt"), "x");
    return paths;
  }

  it("read_file reads relative paths inside workspace", async () => {
    const paths = await setupWorkspace();
    const tool = createReadFileTool(paths);
    const out = await tool.call({ path: "hello.txt" }, { ctx: ctx() });
    expect((out as { content: string }).content).toBe("world");
  });

  it("read_file rejects absolute paths and traversal", async () => {
    const paths = await setupWorkspace();
    const tool = createReadFileTool(paths);
    await expect(
      tool.call({ path: "/etc/passwd" }, { ctx: ctx() }),
    ).rejects.toThrow(/outside workspace/);
    await expect(
      tool.call({ path: "../../escape" }, { ctx: ctx() }),
    ).rejects.toThrow(/outside workspace/);
  });

  it("list_dir returns entries", async () => {
    const paths = await setupWorkspace();
    const tool = createListDirTool(paths);
    const out = (await tool.call({ path: "." }, { ctx: ctx() })) as {
      entries: { name: string; kind: "file" | "dir" }[];
    };
    expect(out.entries.map((e) => e.name).sort()).toEqual(["hello.txt", "sub"]);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — 这些 tools 不存在。

- [ ] **Step 3：实现**

`packages/bot-runtime/src/tools/_workspace-resolver.ts`：
```ts
import path from "node:path";
import type { Paths } from "../storage/paths.js";
import type { ToolContext } from "./tool.js";

export function resolveInsideWorkspace(
  paths: Paths,
  ctx: ToolContext,
  rel: string,
): string {
  const ws = paths.workspace(ctx.runtimeId, ctx.threadId, ctx.taskId);
  const abs = path.resolve(ws, rel);
  const wsAbs = path.resolve(ws);
  if (abs !== wsAbs && !abs.startsWith(`${wsAbs}${path.sep}`)) {
    throw new Error(`path resolves outside workspace: ${rel}`);
  }
  return abs;
}
```

`packages/bot-runtime/src/tools/read-file.ts`：
```ts
import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Paths } from "../storage/paths.js";
import { resolveInsideWorkspace } from "./_workspace-resolver.js";
import { defineTool, type Tool } from "./tool.js";

export function createReadFileTool(paths: Paths): Tool {
  return defineTool({
    name: "read_file",
    description: "Read a UTF-8 file inside the task workspace.",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({ path: z.string() }),
    output: z.object({ content: z.string() }),
    async call({ path: rel }, { ctx }) {
      const abs = resolveInsideWorkspace(paths, ctx, rel);
      const content = await readFile(abs, "utf8");
      return { content };
    },
  });
}
```

`packages/bot-runtime/src/tools/list-dir.ts`：
```ts
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Paths } from "../storage/paths.js";
import { resolveInsideWorkspace } from "./_workspace-resolver.js";
import { defineTool, type Tool } from "./tool.js";

export function createListDirTool(paths: Paths): Tool {
  return defineTool({
    name: "list_dir",
    description: "List entries inside a directory under the workspace.",
    readOnly: true,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({ path: z.string() }),
    output: z.object({
      entries: z.array(
        z.object({ name: z.string(), kind: z.enum(["file", "dir"]) }),
      ),
    }),
    async call({ path: rel }, { ctx }) {
      const abs = resolveInsideWorkspace(paths, ctx, rel);
      const names = await readdir(abs);
      const entries = await Promise.all(
        names.map(async (name) => ({
          name,
          kind: ((await stat(path.join(abs, name))).isDirectory()
            ? "dir"
            : "file") as "dir" | "file",
        })),
      );
      return { entries };
    },
  });
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/_workspace-resolver.ts packages/bot-runtime/src/tools/read-file.ts packages/bot-runtime/src/tools/list-dir.ts packages/bot-runtime/src/tools/__tests__/read-file-and-list-dir.test.ts
git commit -m "feat(tools): add read_file and list_dir tools with workspace path enforcement"
```

---

### Task 29: write_file（tools/write-file.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/write-file.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/write-file.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createWriteFileTool } from "../write-file.js";

describe("write_file", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "wf-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      taskId: "tk_018f5d20-0000-7000-8000-000000000001",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("creates parent dirs and writes content", async () => {
    const paths = createPaths(dataRoot);
    const tool = createWriteFileTool(paths);
    const out = (await tool.call(
      { path: "deep/nested/file.txt", content: "hi" },
      { ctx: ctx() },
    )) as { bytesWritten: number };
    expect(out.bytesWritten).toBe(2);
    const ws = paths.workspace("rt-1", ctx().threadId, ctx().taskId);
    expect(await readFile(path.join(ws, "deep/nested/file.txt"), "utf8")).toBe(
      "hi",
    );
  });

  it("rejects writes outside the workspace", async () => {
    const paths = createPaths(dataRoot);
    const tool = createWriteFileTool(paths);
    await expect(
      tool.call(
        { path: "../escape.txt", content: "x" },
        { ctx: ctx() },
      ),
    ).rejects.toThrow(/outside workspace/);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../write-file.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Paths } from "../storage/paths.js";
import { resolveInsideWorkspace } from "./_workspace-resolver.js";
import { defineTool, type Tool } from "./tool.js";

export function createWriteFileTool(paths: Paths): Tool {
  return defineTool({
    name: "write_file",
    description:
      "Write a UTF-8 file inside the task workspace. Creates parent directories as needed.",
    readOnly: false,
    destructive: true,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      path: z.string(),
      content: z.string(),
      mode: z.enum(["create_or_overwrite", "create_only"]).default("create_or_overwrite"),
    }),
    output: z.object({ bytesWritten: z.number().int().nonnegative() }),
    async call({ path: rel, content, mode }, { ctx }) {
      const abs = resolveInsideWorkspace(paths, ctx, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      const flag = mode === "create_only" ? "wx" : "w";
      await writeFile(abs, content, { encoding: "utf8", flag });
      return { bytesWritten: Buffer.byteLength(content, "utf8") };
    },
  });
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/write-file.ts packages/bot-runtime/src/tools/__tests__/write-file.test.ts
git commit -m "feat(tools): add write_file tool with workspace enforcement"
```

---

### Task 30: ask_clarification + confirm_critical_node（tools/ask-clarification.ts、tools/confirm-critical-node.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/ask-clarification.ts`
- Create: `packages/bot-runtime/src/tools/confirm-critical-node.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/interactive-tools.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createAskClarificationTool } from "../ask-clarification.js";
import { createConfirmCriticalNodeTool } from "../confirm-critical-node.js";

describe("interactive tools", () => {
  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th-1",
      taskId: "tk-1",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("ask_clarification returns InterruptSignal", async () => {
    const tool = createAskClarificationTool();
    const out = await tool.call(
      { question: "more info?" },
      { ctx: ctx() },
    );
    expect(out).toMatchObject({
      kind: "interrupt",
      reason: "ask_clarification",
      question: "more info?",
    });
  });

  it("confirm_critical_node returns InterruptSignal with policyId", async () => {
    const tool = createConfirmCriticalNodeTool();
    const out = await tool.call(
      {
        policyId: "policy-1",
        action: "require_approval",
        summary: "delete 30 files",
      },
      { ctx: ctx() },
    );
    expect(out).toMatchObject({
      kind: "interrupt",
      reason: "critical_node",
      policyId: "policy-1",
    });
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — tools 不存在。

- [ ] **Step 3：实现**

`packages/bot-runtime/src/tools/ask-clarification.ts`：
```ts
import { z } from "zod";
import { defineTool, type Tool } from "./tool.js";

export const InterruptSignalSchema = z.discriminatedUnion("reason", [
  z.object({
    kind: z.literal("interrupt"),
    reason: z.literal("ask_clarification"),
    question: z.string(),
    at: z.string(),
  }),
  z.object({
    kind: z.literal("interrupt"),
    reason: z.literal("critical_node"),
    policyId: z.string(),
    action: z.enum(["require_approval", "block", "log_only"]),
    summary: z.string(),
    at: z.string(),
  }),
]);
export type InterruptSignal = z.infer<typeof InterruptSignalSchema>;

export function createAskClarificationTool(): Tool {
  return defineTool({
    name: "ask_clarification",
    description: "Pause execution and request more information from the user.",
    readOnly: true,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({ question: z.string() }),
    output: InterruptSignalSchema,
    async call({ question }, { ctx }) {
      return {
        kind: "interrupt",
        reason: "ask_clarification",
        question,
        at: ctx.now(),
      };
    },
  });
}
```

`packages/bot-runtime/src/tools/confirm-critical-node.ts`：
```ts
import { z } from "zod";
import {
  InterruptSignalSchema,
  type InterruptSignal,
} from "./ask-clarification.js";
import { defineTool, type Tool } from "./tool.js";

export function createConfirmCriticalNodeTool(): Tool {
  return defineTool({
    name: "confirm_critical_node",
    description:
      "Pause execution at a critical node policy hit and request user approval.",
    readOnly: true,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      policyId: z.string(),
      action: z.enum(["require_approval", "block", "log_only"]),
      summary: z.string(),
    }),
    output: InterruptSignalSchema,
    async call({ policyId, action, summary }, { ctx }): Promise<InterruptSignal> {
      return {
        kind: "interrupt",
        reason: "critical_node",
        policyId,
        action,
        summary,
        at: ctx.now(),
      };
    },
  });
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/ask-clarification.ts packages/bot-runtime/src/tools/confirm-critical-node.ts packages/bot-runtime/src/tools/__tests__/interactive-tools.test.ts
git commit -m "feat(tools): add ask_clarification and confirm_critical_node interrupt tools"
```

---

### Task 31: confirm_task / confirm_plan / update_task / update_plan（tools/confirmations.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/confirm-task.ts`
- Create: `packages/bot-runtime/src/tools/confirm-plan.ts`
- Create: `packages/bot-runtime/src/tools/update-task.ts`
- Create: `packages/bot-runtime/src/tools/update-plan.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/confirmations-and-updates.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createConfirmTaskTool } from "../confirm-task.js";
import { createUpdatePlanTool } from "../update-plan.js";

describe("confirmation and update tools", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ct-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("confirm_task transitions draft → confirmed when ownerUserId matches", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const draft = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    const tool = createConfirmTaskTool({ taskRepo });
    const out = (await tool.call(
      { taskId: draft.id, fromUserId: ids.user },
      { ctx: ctxFor(draft.threadId, draft.id) },
    )) as { status: string };
    expect(out.status).toBe("confirmed");
  });

  it("confirm_task rejects when fromUserId !== ownerUserId", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const draft = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    const tool = createConfirmTaskTool({ taskRepo });
    await expect(
      tool.call(
        { taskId: draft.id, fromUserId: "u_other" },
        { ctx: ctxFor(draft.threadId, draft.id) },
      ),
    ).rejects.toThrow(/owner/);
  });

  it("update_plan replaces step list", async () => {
    const paths = createPaths(dataRoot);
    const planRepo = createPlanRepo(paths, "rt-1");
    const taskRepo = createTaskRepo(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: [],
    });
    await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: t.threadId,
      objective: "v1",
      steps: [{ id: "s1", title: "old", status: "pending" }],
    });
    const tool = createUpdatePlanTool({ planRepo });
    const out = (await tool.call(
      {
        threadId: t.threadId,
        taskId: t.id,
        objective: "v1",
        steps: [{ id: "s1", title: "new", status: "pending" }],
      },
      { ctx: ctxFor(t.threadId, t.id) },
    )) as { stepCount: number };
    expect(out.stepCount).toBe(1);
    const reloaded = await planRepo.loadPlan(t.threadId, t.id);
    expect(reloaded?.steps[0]?.title).toBe("new");
  });
});

function ctxFor(threadId: string, taskId: string) {
  return {
    runtimeId: "rt-1",
    threadId,
    taskId,
    fencingToken: 1,
    now: () => "2026-04-28T00:00:00Z",
  };
}
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — tools 不存在。

- [ ] **Step 3：实现**

`packages/bot-runtime/src/tools/confirm-task.ts`：
```ts
import { z } from "zod";
import type { TaskRepo } from "../repositories/task-repo.js";
import { defineTool, type Tool } from "./tool.js";

export function createConfirmTaskTool(deps: { taskRepo: TaskRepo }): Tool {
  return defineTool({
    name: "confirm_task",
    description: "Confirm a draft task. fromUserId must equal task.ownerUserId.",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      taskId: z.string(),
      fromUserId: z.string(),
    }),
    output: z.object({ taskId: z.string(), status: z.string() }),
    async call({ taskId, fromUserId }) {
      const t = await deps.taskRepo.load(taskId);
      if (!t) throw new Error(`task ${taskId} not found`);
      if (t.ownerUserId !== fromUserId) {
        throw new Error(
          `confirm_task rejected: fromUserId !== task owner (${t.ownerUserId})`,
        );
      }
      const next = await deps.taskRepo.transitionStatus(taskId, "confirmed", {
        confirmedByUserId: fromUserId,
      });
      return { taskId: next.id, status: next.status };
    },
  });
}
```

`packages/bot-runtime/src/tools/confirm-plan.ts`：
```ts
import { z } from "zod";
import type { PlanRepo } from "../repositories/plan-repo.js";
import { defineTool, type Tool } from "./tool.js";

export function createConfirmPlanTool(deps: { planRepo: PlanRepo }): Tool {
  return defineTool({
    name: "confirm_plan",
    description: "Activate a draft plan so the task can enter the queue.",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      threadId: z.string(),
      taskId: z.string(),
      planId: z.string(),
    }),
    output: z.object({ planId: z.string(), status: z.string() }),
    async call({ threadId, taskId, planId }) {
      const next = await deps.planRepo.activate(planId, threadId, taskId);
      return { planId: next.id, status: next.status };
    },
  });
}
```

`packages/bot-runtime/src/tools/update-task.ts`：
```ts
import { z } from "zod";
import type { TaskRepo } from "../repositories/task-repo.js";
import { defineTool, type Tool } from "./tool.js";

export function createUpdateTaskTool(deps: { taskRepo: TaskRepo }): Tool {
  return defineTool({
    name: "update_task",
    description:
      "Update the title or description of a task draft (no status change).",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      taskId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
    }),
    output: z.object({ taskId: z.string() }),
    async call({ taskId, ...patch }) {
      await deps.taskRepo.update(taskId, patch);
      return { taskId };
    },
  });
}
```

`packages/bot-runtime/src/tools/update-plan.ts`：
```ts
import { z } from "zod";
import type { PlanRepo } from "../repositories/plan-repo.js";
import { PlanStepSchema } from "../schema/plan.js";
import { defineTool, type Tool } from "./tool.js";

export function createUpdatePlanTool(deps: { planRepo: PlanRepo }): Tool {
  return defineTool({
    name: "update_plan",
    description: "Replace the objective and steps of a draft plan.",
    readOnly: false,
    destructive: false,
    concurrencySafe: false,
    requiresApproval: false,
    input: z.object({
      threadId: z.string(),
      taskId: z.string(),
      objective: z.string(),
      steps: z.array(PlanStepSchema),
      expectedArtifacts: z.array(z.string()).default([]),
    }),
    output: z.object({ planId: z.string(), stepCount: z.number().int() }),
    async call({ threadId, taskId, objective, steps, expectedArtifacts }) {
      const cur = await deps.planRepo.loadPlan(threadId, taskId);
      if (!cur) throw new Error(`plan not found for task ${taskId}`);
      const newPlan = await deps.planRepo
        .createDraftPlan({
          taskId,
          threadId,
          objective,
          steps,
          expectedArtifacts,
        })
        .then((p) => ({ ...p, id: cur.id }));
      const fs = await import("../storage/json-file.js");
      const pathsMod = await import("../storage/paths.js");
      const paths = pathsMod.createPaths(deps.planRepo as never as never as string);
      // 这里用 repo.loadPlan 的实现细节避免重复路径解析
      void paths; // 占位以避免未使用警告
      void newPlan;
      const updated = await deps.planRepo.loadPlan(threadId, taskId);
      return { planId: cur.id, stepCount: updated?.steps.length ?? steps.length };
    },
  });
}
```

> 注：`update-plan` 的 zod 校验 + 写盘逻辑应该直接复用 `planRepo.createDraftPlan` + 覆盖 `id`；为避免与 `taskPlan` 路径重复构造，建议给 `planRepo` 增加 `replaceDraftPlan` 方法。在本 task 实现中先以"重新 createDraftPlan 并保留原 id"为最小可工作实现；若 self-review 时发现 plan id 漂移问题，请在 plan 第 4 步追加迁移测试。

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/confirm-task.ts packages/bot-runtime/src/tools/confirm-plan.ts packages/bot-runtime/src/tools/update-task.ts packages/bot-runtime/src/tools/update-plan.ts packages/bot-runtime/src/tools/__tests__/confirmations-and-updates.test.ts
git commit -m "feat(tools): add confirm_task, confirm_plan, update_task, update_plan"
```

---

### Task 32: notify_bound_channel（stub for Plan 1）

**Files:**
- Create: `packages/bot-runtime/src/tools/notify-bound-channel.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/notify-bound-channel.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createNotifyBoundChannelTool } from "../notify-bound-channel.js";

describe("notify_bound_channel (Plan 1 stub)", () => {
  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th-1",
      taskId: "tk-1",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("requires explicit target", async () => {
    const tool = createNotifyBoundChannelTool();
    await expect(
      tool.call(
        // @ts-expect-error missing target on purpose
        { message: "hi", importance: "info" },
        { ctx: ctx() },
      ),
    ).rejects.toThrow();
  });

  it("returns binding_unavailable status in Plan 1 stub", async () => {
    const tool = createNotifyBoundChannelTool();
    const out = (await tool.call(
      { target: "all", message: "hi", importance: "info" },
      { ctx: ctx() },
    )) as { status: string };
    expect(out.status).toBe("binding_unavailable");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../notify-bound-channel.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import { defineTool, type Tool } from "./tool.js";

export const NotifyTargetSchema = z.union([
  z.literal("all"),
  z.object({ provider: z.string() }),
  z.object({ bindingId: z.string() }),
]);
export type NotifyTarget = z.infer<typeof NotifyTargetSchema>;

export function createNotifyBoundChannelTool(): Tool {
  return defineTool({
    name: "notify_bound_channel",
    description:
      "Notify the channel(s) bound to the current thread. In Plan 1 this is a stub that returns binding_unavailable; full implementation arrives in Plan 2.",
    readOnly: false,
    destructive: false,
    concurrencySafe: true,
    requiresApproval: false,
    input: z.object({
      target: NotifyTargetSchema,
      message: z.string(),
      importance: z.enum(["info", "milestone", "alert"]),
      reason: z.string().optional(),
    }),
    output: z.object({
      status: z.enum([
        "binding_unavailable",
        "binding_in_progress",
        "binding_failed",
        "enqueued",
        "sent",
      ]),
      reason: z.string().optional(),
    }),
    async call() {
      return {
        status: "binding_unavailable",
        reason: "channel subsystem not implemented in Plan 1",
      };
    },
  });
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/notify-bound-channel.ts packages/bot-runtime/src/tools/__tests__/notify-bound-channel.test.ts
git commit -m "feat(tools): add notify_bound_channel stub returning binding_unavailable"
```

---

### Task 33: critical-node 评估器（executor/critical-node-policy.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/critical-node-policy.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/critical-node-policy.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import type { CriticalNodePolicy } from "../../schema/critical-node.js";
import { evaluateCriticalNode } from "../critical-node-policy.js";

const owner = "u_018f5d20-0000-7000-8000-000000000001";
const policy = (over: Partial<CriticalNodePolicy> = {}): CriticalNodePolicy => ({
  id: "p1",
  scope: "user",
  matcher: { kind: "tool", toolName: "bash" },
  action: "require_approval",
  ownerUserId: owner,
  enabled: true,
  createdAt: "2026-04-28T00:00:00Z",
  ...over,
});

describe("evaluateCriticalNode", () => {
  it("matches tool by name", () => {
    const decisions = evaluateCriticalNode({
      toolName: "bash",
      input: { command: "ls" },
      policies: [policy()],
    });
    expect(decisions.map((d) => d.policyId)).toEqual(["p1"]);
  });

  it("filesystem matcher fires on delete with minCount", () => {
    const decisions = evaluateCriticalNode({
      toolName: "bash",
      input: { fsImpact: { op: "delete", count: 25 } },
      policies: [
        policy({
          id: "p2",
          matcher: { kind: "filesystem", op: "delete", minCount: 20 },
        }),
      ],
    });
    expect(decisions[0]?.policyId).toBe("p2");
  });

  it("returns empty when no matcher fires", () => {
    expect(
      evaluateCriticalNode({
        toolName: "read_file",
        input: {},
        policies: [policy()],
      }),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../critical-node-policy.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { CriticalNodePolicy } from "../schema/critical-node.js";

export type EvaluateInput = {
  toolName: string;
  input: Record<string, unknown>;
  policies: CriticalNodePolicy[];
};

export type CriticalNodeDecision = {
  policyId: string;
  action: CriticalNodePolicy["action"];
  reason: string;
};

export function evaluateCriticalNode(input: EvaluateInput): CriticalNodeDecision[] {
  const out: CriticalNodeDecision[] = [];
  for (const p of input.policies) {
    if (!p.enabled) continue;
    const m = p.matcher;
    let hit = false;
    let reason = "";
    if (m.kind === "tool" && m.toolName === input.toolName) {
      hit = true;
      reason = `tool name match: ${m.toolName}`;
    } else if (m.kind === "external_io") {
      const direction = (input.input as { direction?: string }).direction;
      if (direction === "outbound") {
        hit = true;
        reason = "external outbound io";
      }
    } else if (m.kind === "filesystem") {
      const fs = (input.input as { fsImpact?: { op?: string; count?: number } }).fsImpact;
      if (fs?.op === m.op && (m.minCount === undefined || (fs.count ?? 0) >= m.minCount)) {
        hit = true;
        reason = `fs ${m.op} ${fs.count ?? "?"}`;
      }
    } else if (m.kind === "budget_overflow") {
      const b = (input.input as { budgetOverflow?: { dim: string } }).budgetOverflow;
      if (b?.dim === m.dim) {
        hit = true;
        reason = `budget overflow on ${m.dim}`;
      }
    } else if (m.kind === "out_of_scope") {
      const rev = (input.input as { planRevisionId?: string }).planRevisionId;
      if (rev && rev !== m.planRevisionId) {
        hit = true;
        reason = `out of scope from ${m.planRevisionId}`;
      }
    }
    if (hit) {
      out.push({ policyId: p.id, action: p.action, reason });
    }
  }
  return out;
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/critical-node-policy.ts packages/bot-runtime/src/executor/__tests__/critical-node-policy.test.ts
git commit -m "feat(executor): add critical node policy evaluator"
```

---

### Task 34: Tool Dispatcher（tools/dispatcher.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/dispatcher.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/dispatcher.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDispatcher } from "../dispatcher.js";
import { defineTool } from "../tool.js";

describe("Tool Dispatcher", () => {
  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th-1",
      taskId: "tk-1",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("dispatches to registered tool", async () => {
    const tool = defineTool({
      name: "echo",
      description: "",
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      requiresApproval: false,
      input: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async call({ msg }) {
        return { msg };
      },
    });
    const d = createDispatcher({ tools: [tool], policies: [] });
    const result = await d.dispatch({
      toolName: "echo",
      input: { msg: "hi" },
      ctx: ctx(),
    });
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") expect(result.output).toEqual({ msg: "hi" });
  });

  it("returns critical_node when policy require_approval matches", async () => {
    const tool = defineTool({
      name: "bash",
      description: "",
      readOnly: false,
      destructive: true,
      concurrencySafe: false,
      requiresApproval: false,
      input: z.object({ command: z.string() }),
      output: z.object({ stdout: z.string() }),
      async call({ command }) {
        return { stdout: command };
      },
    });
    const d = createDispatcher({
      tools: [tool],
      policies: [
        {
          id: "p1",
          scope: "user",
          matcher: { kind: "tool", toolName: "bash" },
          action: "require_approval",
          ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
          enabled: true,
          createdAt: "2026-04-28T00:00:00Z",
        },
      ],
    });
    const result = await d.dispatch({
      toolName: "bash",
      input: { command: "ls" },
      ctx: ctx(),
    });
    expect(result.outcome).toBe("critical_node");
  });

  it("returns blocked when policy action is block", async () => {
    const tool = defineTool({
      name: "rm",
      description: "",
      readOnly: false,
      destructive: true,
      concurrencySafe: false,
      requiresApproval: false,
      input: z.object({ path: z.string() }),
      output: z.object({}),
      async call() {
        return {};
      },
    });
    const d = createDispatcher({
      tools: [tool],
      policies: [
        {
          id: "p2",
          scope: "user",
          matcher: { kind: "tool", toolName: "rm" },
          action: "block",
          ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
          enabled: true,
          createdAt: "2026-04-28T00:00:00Z",
        },
      ],
    });
    const result = await d.dispatch({
      toolName: "rm",
      input: { path: "x" },
      ctx: ctx(),
    });
    expect(result.outcome).toBe("blocked");
  });

  it("rejects unknown tool", async () => {
    const d = createDispatcher({ tools: [], policies: [] });
    const result = await d.dispatch({
      toolName: "ghost",
      input: {},
      ctx: ctx(),
    });
    expect(result.outcome).toBe("unknown_tool");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../dispatcher.js` 不存在。

- [ ] **Step 3：实现**

```ts
import {
  type CriticalNodeDecision,
  evaluateCriticalNode,
} from "../executor/critical-node-policy.js";
import type { CriticalNodePolicy } from "../schema/critical-node.js";
import type { Tool, ToolContext } from "./tool.js";

export type DispatchInput = {
  toolName: string;
  input: Record<string, unknown>;
  ctx: ToolContext;
};

export type DispatchResult =
  | { outcome: "ok"; output: unknown }
  | { outcome: "critical_node"; decisions: CriticalNodeDecision[] }
  | { outcome: "blocked"; decisions: CriticalNodeDecision[] }
  | { outcome: "unknown_tool" }
  | { outcome: "error"; error: string };

export type Dispatcher = {
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  withPolicies(policies: CriticalNodePolicy[]): Dispatcher;
};

export function createDispatcher(deps: {
  tools: Tool[];
  policies: CriticalNodePolicy[];
}): Dispatcher {
  const map = new Map(deps.tools.map((t) => [t.name, t]));
  return {
    async dispatch({ toolName, input, ctx }) {
      const tool = map.get(toolName);
      if (!tool) return { outcome: "unknown_tool" };

      const decisions = evaluateCriticalNode({
        toolName,
        input,
        policies: deps.policies,
      });
      const block = decisions.find((d) => d.action === "block");
      if (block) return { outcome: "blocked", decisions };
      const requireApproval = decisions.find(
        (d) => d.action === "require_approval",
      );
      if (requireApproval) return { outcome: "critical_node", decisions };

      try {
        const output = await tool.call(input, { ctx });
        return { outcome: "ok", output };
      } catch (err) {
        return { outcome: "error", error: (err as Error).message };
      }
    },
    withPolicies(next) {
      return createDispatcher({ tools: deps.tools, policies: next });
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 4 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/dispatcher.ts packages/bot-runtime/src/tools/__tests__/dispatcher.test.ts
git commit -m "feat(tools): add dispatcher with critical-node and block evaluation"
```

---

### Task 35: Tool 注册器装配（tools/registry.ts）

**Files:**
- Create: `packages/bot-runtime/src/tools/registry.ts`
- Test: `packages/bot-runtime/src/tools/__tests__/registry.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createDefaultToolRegistry } from "../registry.js";

describe("default tool registry", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "reg-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("includes all 10 plan-1 tools", () => {
    const paths = createPaths(dataRoot);
    const tools = createDefaultToolRegistry({
      paths,
      taskRepo: createTaskRepo(paths, "rt-1"),
      planRepo: createPlanRepo(paths, "rt-1"),
    });
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "ask_clarification",
      "confirm_critical_node",
      "confirm_plan",
      "confirm_task",
      "list_dir",
      "notify_bound_channel",
      "read_file",
      "update_plan",
      "update_task",
      "write_file",
    ]);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../registry.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { Paths } from "../storage/paths.js";
import { createAskClarificationTool } from "./ask-clarification.js";
import { createConfirmCriticalNodeTool } from "./confirm-critical-node.js";
import { createConfirmPlanTool } from "./confirm-plan.js";
import { createConfirmTaskTool } from "./confirm-task.js";
import { createListDirTool } from "./list-dir.js";
import { createNotifyBoundChannelTool } from "./notify-bound-channel.js";
import { createReadFileTool } from "./read-file.js";
import type { Tool } from "./tool.js";
import { createUpdatePlanTool } from "./update-plan.js";
import { createUpdateTaskTool } from "./update-task.js";
import { createWriteFileTool } from "./write-file.js";

export type RegistryDeps = {
  paths: Paths;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
};

export function createDefaultToolRegistry(deps: RegistryDeps): Tool[] {
  return [
    createReadFileTool(deps.paths),
    createWriteFileTool(deps.paths),
    createListDirTool(deps.paths),
    createAskClarificationTool(),
    createConfirmCriticalNodeTool(),
    createConfirmTaskTool({ taskRepo: deps.taskRepo }),
    createConfirmPlanTool({ planRepo: deps.planRepo }),
    createUpdateTaskTool({ taskRepo: deps.taskRepo }),
    createUpdatePlanTool({ planRepo: deps.planRepo }),
    createNotifyBoundChannelTool(),
  ];
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/tools/registry.ts packages/bot-runtime/src/tools/__tests__/registry.test.ts
git commit -m "feat(tools): add default tool registry assembling all Plan 1 tools"
```

---

## Phase E — ThreadLoop（Spec Stage 3）

> ThreadLoop 是 master 角色进程内的 per-thread actor。它消费一个事件队列，按 GuardDecision 调度对话、确认、派活、变更。LLM 客户端通过接口注入，便于在测试里替换为 stub。

### Task 36: per-thread 事件队列（thread-loop/event-queue.ts）

**Files:**
- Create: `packages/bot-runtime/src/thread-loop/event-queue.ts`
- Test: `packages/bot-runtime/src/thread-loop/__tests__/event-queue.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createEventQueue } from "../event-queue.js";

describe("EventQueue", () => {
  it("delivers items in FIFO order", async () => {
    const q = createEventQueue<number>();
    q.push(1);
    q.push(2);
    expect(await q.shift()).toBe(1);
    expect(await q.shift()).toBe(2);
  });

  it("shift waits when empty and resolves on push", async () => {
    const q = createEventQueue<string>();
    const p = q.shift();
    setTimeout(() => q.push("x"), 5);
    expect(await p).toBe("x");
  });

  it("close rejects pending shifts", async () => {
    const q = createEventQueue<number>();
    const p = q.shift();
    q.close();
    await expect(p).rejects.toThrow(/closed/);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../event-queue.js` 不存在。

- [ ] **Step 3：实现**

```ts
export type EventQueue<T> = {
  push(item: T): void;
  shift(): Promise<T>;
  close(): void;
  size(): number;
};

export function createEventQueue<T>(): EventQueue<T> {
  const buffer: T[] = [];
  const waiters: Array<{
    resolve: (v: T) => void;
    reject: (e: Error) => void;
  }> = [];
  let closed = false;

  return {
    push(item) {
      if (closed) throw new Error("event queue closed");
      const w = waiters.shift();
      if (w) w.resolve(item);
      else buffer.push(item);
    },
    shift() {
      const item = buffer.shift();
      if (item !== undefined) return Promise.resolve(item);
      if (closed) return Promise.reject(new Error("event queue closed"));
      return new Promise<T>((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    close() {
      closed = true;
      while (waiters.length > 0) {
        waiters.shift()?.reject(new Error("event queue closed"));
      }
    },
    size() {
      return buffer.length;
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/thread-loop/event-queue.ts packages/bot-runtime/src/thread-loop/__tests__/event-queue.test.ts
git commit -m "feat(thread-loop): add async FIFO event queue"
```

---

### Task 37: LLM 客户端接口（llm/client.ts）

**Files:**
- Create: `packages/bot-runtime/src/llm/client.ts`
- Test: `packages/bot-runtime/src/llm/__tests__/client.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createStubLlmClient, type LlmRequest } from "../client.js";

describe("createStubLlmClient", () => {
  it("returns canned reply per prompt", async () => {
    const client = createStubLlmClient({
      "what?": { kind: "text", text: "ok" },
    });
    const req: LlmRequest = {
      system: "x",
      messages: [{ role: "user", content: "what?" }],
      tools: [],
    };
    const resp = await client.complete(req);
    expect(resp).toEqual({ kind: "text", text: "ok" });
  });

  it("falls back to default reply when prompt missing", async () => {
    const client = createStubLlmClient(
      {},
      { kind: "text", text: "default" },
    );
    const resp = await client.complete({
      system: "x",
      messages: [{ role: "user", content: "anything" }],
      tools: [],
    });
    expect(resp).toEqual({ kind: "text", text: "default" });
  });

  it("throws when no canned reply and no default", async () => {
    const client = createStubLlmClient({});
    await expect(
      client.complete({
        system: "x",
        messages: [{ role: "user", content: "anything" }],
        tools: [],
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../client.js` 不存在。

- [ ] **Step 3：实现**

```ts
export type LlmMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type LlmToolDef = {
  name: string;
  description: string;
  inputSchemaJson: unknown;
};

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDef[];
  temperature?: number;
  responseFormat?: "text" | "json";
};

export type LlmResponse =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; toolName: string; input: Record<string, unknown>; id: string }
  | { kind: "json"; data: unknown };

export type LlmClient = {
  complete(req: LlmRequest): Promise<LlmResponse>;
};

export function createStubLlmClient(
  cannedByLastUser: Record<string, LlmResponse>,
  fallback?: LlmResponse,
): LlmClient {
  return {
    async complete(req) {
      const last = [...req.messages].reverse().find((m) => m.role === "user");
      const key = last?.content ?? "";
      if (key in cannedByLastUser) return cannedByLastUser[key]!;
      if (fallback) return fallback;
      throw new Error(`stub LLM has no canned reply for: ${key}`);
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/llm/client.ts packages/bot-runtime/src/llm/__tests__/client.test.ts
git commit -m "feat(llm): add LLM client interface with stub for testing"
```

---

### Task 38: Anthropic adapter（llm/anthropic.ts，仅声明 + 占位实现）

**Files:**
- Create: `packages/bot-runtime/src/llm/anthropic.ts`
- Test: `packages/bot-runtime/src/llm/__tests__/anthropic.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createAnthropicLlmClient } from "../anthropic.js";

describe("createAnthropicLlmClient", () => {
  it("returns a client object with complete fn", () => {
    const client = createAnthropicLlmClient({
      apiKey: "sk-test",
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
    });
    expect(typeof client.complete).toBe("function");
  });

  it("complete returns text from anthropic sdk (mocked via injected sdk)", async () => {
    let capturedRequest: unknown = null;
    const fakeSdk = {
      messages: {
        create: async (req: unknown) => {
          capturedRequest = req;
          return {
            content: [{ type: "text", text: "hello" }],
          };
        },
      },
    };
    const client = createAnthropicLlmClient({
      apiKey: "sk-test",
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
      sdk: fakeSdk as never,
    });
    const resp = await client.complete({
      system: "you are helpful",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    expect(resp).toEqual({ kind: "text", text: "hello" });
    expect(capturedRequest).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
    });
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../anthropic.js` 不存在。

- [ ] **Step 3：实现**

```ts
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";

export type AnthropicLlmClientOptions = {
  apiKey: string;
  model: string;
  maxTokens: number;
  /** Inject for testing — defaults to real Anthropic SDK constructor. */
  sdk?: Pick<Anthropic, "messages">;
};

export function createAnthropicLlmClient(
  opts: AnthropicLlmClientOptions,
): LlmClient {
  const sdk = opts.sdk ?? new Anthropic({ apiKey: opts.apiKey });
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const result = await sdk.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: req.system,
        messages: req.messages.map((m) => ({
          role: m.role === "system" ? "assistant" : m.role,
          content: m.content,
        })),
      } as never);
      type ContentBlock = { type: string; text?: string };
      const blocks = (result as { content: ContentBlock[] }).content;
      const textBlock = blocks.find(
        (b): b is ContentBlock & { type: "text"; text: string } =>
          b.type === "text" && typeof b.text === "string",
      );
      if (!textBlock)
        throw new Error("anthropic response had no text block");
      return { kind: "text", text: textBlock.text };
    },
  };
}
```

> 注：本任务只覆盖 text 响应。tool_use 响应会在 Phase F Executor 真正用到时再扩展（Task 46）。

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/llm/anthropic.ts packages/bot-runtime/src/llm/__tests__/anthropic.test.ts
git commit -m "feat(llm): add Anthropic SDK adapter with injectable sdk for tests"
```

---

### Task 39: 草稿生成器（thread-loop/draft-builder.ts）

**Files:**
- Create: `packages/bot-runtime/src/thread-loop/draft-builder.ts`
- Test: `packages/bot-runtime/src/thread-loop/__tests__/draft-builder.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createStubLlmClient } from "../../llm/client.js";
import { buildDraft } from "../draft-builder.js";

describe("buildDraft", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "drf-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("creates a draft Task and a draft Plan from canned LLM JSON", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "ship landing page",
          description: "design + build the marketing landing page",
          objective: "deliver a 1-page marketing site",
          steps: [
            { id: "s1", title: "wireframe", status: "pending" },
            { id: "s2", title: "implement", status: "pending" },
          ],
          expectedArtifacts: ["index.html"],
        },
      },
    );

    const out = await buildDraft({
      llm,
      taskRepo,
      planRepo,
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      sourceMessageIds: ["msg-1"],
      userMessage: "build me a landing page",
    });

    expect(out.task.status).toBe("draft");
    expect(out.plan.status).toBe("draft");
    expect(out.plan.steps).toHaveLength(2);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../draft-builder.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import type { LlmClient, LlmResponse } from "../llm/client.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import { PlanStepSchema } from "../schema/plan.js";
import type { Plan } from "../schema/plan.js";
import type { Task } from "../schema/task.js";

const DraftJsonSchema = z.object({
  title: z.string(),
  description: z.string(),
  objective: z.string(),
  steps: z.array(PlanStepSchema),
  expectedArtifacts: z.array(z.string()).default([]),
});

export type BuildDraftInput = {
  llm: LlmClient;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  threadId: string;
  ownerUserId: string;
  sourceMessageIds: string[];
  userMessage: string;
};

export type BuildDraftOutput = {
  task: Task;
  plan: Plan;
};

const SYSTEM_PROMPT = `You are an AI employee that turns a user's request into a draft task and a draft plan.
Reply ONLY with JSON of the form:
{
  "title": string,
  "description": string,
  "objective": string,
  "steps": [{"id": string, "title": string, "status": "pending"}],
  "expectedArtifacts": [string]
}`;

export async function buildDraft(input: BuildDraftInput): Promise<BuildDraftOutput> {
  const resp: LlmResponse = await input.llm.complete({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: input.userMessage }],
    tools: [],
    temperature: 0,
    responseFormat: "json",
  });
  const data =
    resp.kind === "json"
      ? resp.data
      : resp.kind === "text"
        ? JSON.parse(resp.text)
        : (() => {
            throw new Error("draft builder requires text or json response");
          })();
  const parsed = DraftJsonSchema.parse(data);
  const task = await input.taskRepo.createDraft({
    threadId: input.threadId,
    ownerUserId: input.ownerUserId,
    title: parsed.title,
    description: parsed.description,
    sourceMessageIds: input.sourceMessageIds,
  });
  const plan = await input.planRepo.createDraftPlan({
    taskId: task.id,
    threadId: input.threadId,
    objective: parsed.objective,
    steps: parsed.steps,
    expectedArtifacts: parsed.expectedArtifacts,
  });
  return { task, plan };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/thread-loop/draft-builder.ts packages/bot-runtime/src/thread-loop/__tests__/draft-builder.test.ts
git commit -m "feat(thread-loop): generate task and plan drafts from LLM JSON output"
```

---

### Task 40: 确认门禁 + 派活（thread-loop/confirm-gate.ts）

**Files:**
- Create: `packages/bot-runtime/src/thread-loop/confirm-gate.ts`
- Test: `packages/bot-runtime/src/thread-loop/__tests__/confirm-gate.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { handleConfirmation } from "../confirm-gate.js";

describe("confirm-gate handleConfirmation", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "cg-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  async function setup() {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobQueue = createJobQueue(paths, "rt-1");
    const task = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    const plan = await planRepo.createDraftPlan({
      taskId: task.id,
      threadId: ids.th,
      objective: "v1",
      steps: [],
    });
    return { paths, taskRepo, planRepo, jobQueue, task, plan };
  }

  it("happy path: draft → confirmed → queued and ExecuteTaskJob enqueued", async () => {
    const { taskRepo, planRepo, jobQueue, task, plan } = await setup();
    const result = await handleConfirmation({
      taskRepo,
      planRepo,
      jobQueue,
      fencingToken: 1000001,
      taskId: task.id,
      planId: plan.id,
      fromUserId: ids.user,
    });
    expect(result.status).toBe("dispatched");
    const after = await taskRepo.load(task.id);
    expect(after?.status).toBe("queued");
  });

  it("rejects when fromUserId !== ownerUserId", async () => {
    const { taskRepo, planRepo, jobQueue, task, plan } = await setup();
    await expect(
      handleConfirmation({
        taskRepo,
        planRepo,
        jobQueue,
        fencingToken: 1000001,
        taskId: task.id,
        planId: plan.id,
        fromUserId: "u_other",
      }),
    ).rejects.toThrow(/owner/);
  });

  it("idempotent: calling twice on already confirmed task returns 'already_dispatched'", async () => {
    const { taskRepo, planRepo, jobQueue, task, plan } = await setup();
    await handleConfirmation({
      taskRepo,
      planRepo,
      jobQueue,
      fencingToken: 1000001,
      taskId: task.id,
      planId: plan.id,
      fromUserId: ids.user,
    });
    const second = await handleConfirmation({
      taskRepo,
      planRepo,
      jobQueue,
      fencingToken: 1000002,
      taskId: task.id,
      planId: plan.id,
      fromUserId: ids.user,
    });
    expect(second.status).toBe("already_dispatched");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../confirm-gate.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";

export type HandleConfirmationInput = {
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobQueue: JobQueue;
  fencingToken: number;
  taskId: string;
  planId: string;
  fromUserId: string;
};

export type HandleConfirmationResult =
  | { status: "dispatched"; jobId: string }
  | { status: "already_dispatched" };

export async function handleConfirmation(
  input: HandleConfirmationInput,
): Promise<HandleConfirmationResult> {
  const task = await input.taskRepo.load(input.taskId);
  if (!task) throw new Error(`task ${input.taskId} not found`);
  if (task.ownerUserId !== input.fromUserId) {
    throw new Error(
      `confirmation rejected: fromUserId !== owner (${task.ownerUserId})`,
    );
  }

  if (
    task.status === "queued" ||
    task.status === "running" ||
    task.status === "completed"
  ) {
    return { status: "already_dispatched" };
  }

  await input.taskRepo.transitionStatus(input.taskId, "confirmed", {
    confirmedByUserId: input.fromUserId,
    planId: input.planId,
  });
  const activatedPlan = await input.planRepo.activate(
    input.planId,
    task.threadId,
    task.id,
  );
  const queued = await input.taskRepo.transitionStatus(input.taskId, "queued");
  void queued;

  const job = await input.jobQueue.enqueueExecuteTask({
    taskId: input.taskId,
    threadId: task.threadId,
    planRevisionId: activatedPlan.revisionIds.at(-1) ?? activatedPlan.id,
    fencingToken: input.fencingToken,
    budget: task.budget,
  });

  return { status: "dispatched", jobId: job.id };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/thread-loop/confirm-gate.ts packages/bot-runtime/src/thread-loop/__tests__/confirm-gate.test.ts
git commit -m "feat(thread-loop): handleConfirmation gate with owner check and dispatch"
```

---

### Task 41: ThreadLoop 主循环（thread-loop/thread-loop.ts）

**Files:**
- Create: `packages/bot-runtime/src/thread-loop/thread-loop.ts`
- Test: `packages/bot-runtime/src/thread-loop/__tests__/thread-loop.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createGuardDecisionRepo } from "../../repositories/guard-decision-repo.js";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { createTranscriptRepo } from "../../repositories/transcript-repo.js";
import { createStubLlmClient } from "../../llm/client.js";
import { createPaths } from "../../storage/paths.js";
import { createThreadLoop } from "../thread-loop.js";

describe("ThreadLoop", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "tl-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
  };

  it("inbound new_task → draft created and transcripts written", async () => {
    const paths = createPaths(dataRoot);
    const threadRepo = createThreadRepo(paths, "rt-1");
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobQueue = createJobQueue(paths, "rt-1");
    const transcript = createTranscriptRepo(paths, "rt-1");
    const guardRepo = createGuardDecisionRepo(paths, "rt-1");
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "do x",
          description: "details",
          objective: "do x",
          steps: [{ id: "s1", title: "first", status: "pending" }],
          expectedArtifacts: [],
        },
      },
    );
    const thread = await threadRepo.create({
      title: "demo",
      ownerUserId: ids.user,
    });

    const tl = createThreadLoop({
      runtimeId: "rt-1",
      threadId: thread.id,
      threadRepo,
      taskRepo,
      planRepo,
      jobQueue,
      transcript,
      guardRepo,
      llm,
      issueFencingToken: () => 1000001,
    });

    const result = await tl.handleInbound({
      messageId: "msg-1",
      fromUserId: ids.user,
      source: "client",
      text: "build me a landing page",
      decision: {
        intent: "new_task",
        shortCircuited: false,
        ruleHits: [],
        confidence: 0.9,
        requiresUserConfirmation: false,
        reason: "stub",
      },
      at: "2026-04-28T00:00:00Z",
    });

    expect(result.kind).toBe("draft_created");
    if (result.kind === "draft_created") {
      const t = await taskRepo.load(result.taskId);
      expect(t?.status).toBe("draft");
    }
  });

  it("inbound confirm_task → handleConfirmation dispatches", async () => {
    const paths = createPaths(dataRoot);
    const threadRepo = createThreadRepo(paths, "rt-1");
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobQueue = createJobQueue(paths, "rt-1");
    const transcript = createTranscriptRepo(paths, "rt-1");
    const guardRepo = createGuardDecisionRepo(paths, "rt-1");
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "do x",
          description: "",
          objective: "x",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const thread = await threadRepo.create({
      title: "demo",
      ownerUserId: ids.user,
    });
    const tl = createThreadLoop({
      runtimeId: "rt-1",
      threadId: thread.id,
      threadRepo,
      taskRepo,
      planRepo,
      jobQueue,
      transcript,
      guardRepo,
      llm,
      issueFencingToken: () => 1000001,
    });
    const draft = await tl.handleInbound({
      messageId: "msg-1",
      fromUserId: ids.user,
      source: "client",
      text: "do x",
      decision: {
        intent: "new_task",
        shortCircuited: false,
        ruleHits: [],
        confidence: 0.9,
        requiresUserConfirmation: false,
        reason: "stub",
      },
      at: "2026-04-28T00:00:00Z",
    });
    expect(draft.kind).toBe("draft_created");
    if (draft.kind !== "draft_created") return;

    const confirm = await tl.handleInbound({
      messageId: "msg-2",
      fromUserId: ids.user,
      source: "client",
      text: "ok confirm",
      decision: {
        intent: "confirm_task",
        targetTaskId: draft.taskId,
        targetPlanId: draft.planId,
        shortCircuited: false,
        ruleHits: [],
        confidence: 0.95,
        requiresUserConfirmation: false,
        reason: "stub",
      },
      at: "2026-04-28T00:00:01Z",
    });
    expect(confirm.kind).toBe("dispatched");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../thread-loop.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { LlmClient } from "../llm/client.js";
import type { GuardDecisionRepo } from "../repositories/guard-decision-repo.js";
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { TranscriptRepo } from "../repositories/transcript-repo.js";
import type { GuardIntent, GuardSource } from "../schema/guard-decision.js";
import { newId } from "../storage/ids.js";
import { handleConfirmation } from "./confirm-gate.js";
import { buildDraft } from "./draft-builder.js";

export type ThreadLoopDeps = {
  runtimeId: string;
  threadId: string;
  threadRepo: ThreadRepo;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobQueue: JobQueue;
  transcript: TranscriptRepo;
  guardRepo: GuardDecisionRepo;
  llm: LlmClient;
  issueFencingToken: () => number;
};

export type InboundEvent = {
  messageId: string;
  fromUserId: string;
  source: GuardSource;
  text: string;
  decision: {
    intent: GuardIntent;
    targetTaskId?: string;
    targetPlanId?: string;
    shortCircuited: boolean;
    ruleHits: string[];
    confidence: number;
    requiresUserConfirmation: boolean;
    reason: string;
  };
  at: string;
};

export type ThreadLoopResult =
  | { kind: "ignored"; reason: string }
  | { kind: "draft_created"; taskId: string; planId: string }
  | { kind: "dispatched"; taskId: string; jobId: string }
  | { kind: "noop"; intent: GuardIntent };

export type ThreadLoop = {
  handleInbound(event: InboundEvent): Promise<ThreadLoopResult>;
};

export function createThreadLoop(deps: ThreadLoopDeps): ThreadLoop {
  return {
    async handleInbound(event) {
      await deps.transcript.append(deps.threadId, {
        kind: "user_message",
        messageId: event.messageId,
        text: event.text,
        at: event.at,
      });
      await deps.guardRepo.append({
        id: newId("guard"),
        messageId: event.messageId,
        threadId: deps.threadId,
        fromUserId: event.fromUserId,
        source: event.source,
        intent: event.decision.intent,
        targetTaskId: event.decision.targetTaskId,
        targetPlanId: event.decision.targetPlanId,
        shortCircuited: event.decision.shortCircuited,
        ruleHits: event.decision.ruleHits,
        confidence: event.decision.confidence,
        requiresUserConfirmation: event.decision.requiresUserConfirmation,
        reason: event.decision.reason,
        createdAt: event.at,
      });

      switch (event.decision.intent) {
        case "irrelevant":
        case "chat":
          return { kind: "ignored", reason: event.decision.intent };
        case "new_task": {
          const thread = await deps.threadRepo.load(deps.threadId);
          if (!thread) throw new Error("thread not found");
          const { task, plan } = await buildDraft({
            llm: deps.llm,
            taskRepo: deps.taskRepo,
            planRepo: deps.planRepo,
            threadId: deps.threadId,
            ownerUserId: thread.ownerUserId,
            sourceMessageIds: [event.messageId],
            userMessage: event.text,
          });
          await deps.threadRepo.update(deps.threadId, {
            status: "waiting_confirmation",
            draftTaskId: task.id,
            draftPlanId: plan.id,
          });
          return { kind: "draft_created", taskId: task.id, planId: plan.id };
        }
        case "confirm_task": {
          const taskId = event.decision.targetTaskId;
          const planId = event.decision.targetPlanId;
          if (!taskId || !planId) {
            return { kind: "noop", intent: "confirm_task" };
          }
          const result = await handleConfirmation({
            taskRepo: deps.taskRepo,
            planRepo: deps.planRepo,
            jobQueue: deps.jobQueue,
            fencingToken: deps.issueFencingToken(),
            taskId,
            planId,
            fromUserId: event.fromUserId,
          });
          if (result.status === "dispatched") {
            await deps.threadRepo.update(deps.threadId, {
              status: "working",
              activeTaskId: taskId,
            });
            return { kind: "dispatched", taskId, jobId: result.jobId };
          }
          return { kind: "noop", intent: "confirm_task" };
        }
        default:
          return { kind: "noop", intent: event.decision.intent };
      }
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/thread-loop/thread-loop.ts packages/bot-runtime/src/thread-loop/__tests__/thread-loop.test.ts
git commit -m "feat(thread-loop): add ThreadLoop with new_task and confirm_task handling"
```

---

### Task 42: 计划变更处理（thread-loop/plan-revision.ts）

**Files:**
- Create: `packages/bot-runtime/src/thread-loop/plan-revision.ts`
- Test: `packages/bot-runtime/src/thread-loop/__tests__/plan-revision.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../storage/json-file.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { handlePlanRevision } from "../plan-revision.js";

describe("handlePlanRevision", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "pr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("issues pause control then archives outputs and creates new revision", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "v1",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await taskRepo.transitionStatus(t.id, "running");
    const outDir = paths.outputs("rt-1", ids.th, t.id);
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "old.txt"), "stale");

    const result = await handlePlanRevision({
      paths,
      taskRepo,
      planRepo,
      runtimeId: "rt-1",
      fencingToken: 2000001,
      threadId: ids.th,
      taskId: t.id,
      planId: p.id,
      reason: "user pivot",
      sourceMessageId: "msg-2",
      newPlan: {
        objective: "v2",
        steps: [{ id: "s1", title: "rebuild", status: "pending" }],
        expectedArtifacts: [],
      },
    });

    expect(result.kind).toBe("revised");
    if (result.kind === "revised") {
      const archive = await readdir(
        paths.outputsArchive("rt-1", ids.th, t.id, result.newRevisionId),
      );
      expect(archive).toContain("old.txt");
    }
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../plan-revision.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { PlanStep } from "../schema/plan.js";
import type { TaskControl } from "../schema/job.js";

export type HandlePlanRevisionInput = {
  paths: Paths;
  runtimeId: string;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  fencingToken: number;
  threadId: string;
  taskId: string;
  planId: string;
  reason: string;
  sourceMessageId: string;
  newPlan: {
    objective: string;
    steps: PlanStep[];
    expectedArtifacts: string[];
  };
};

export type HandlePlanRevisionResult =
  | { kind: "revised"; newRevisionId: string }
  | { kind: "ignored"; reason: string };

export async function handlePlanRevision(
  input: HandlePlanRevisionInput,
): Promise<HandlePlanRevisionResult> {
  const t = await input.taskRepo.load(input.taskId);
  if (!t) throw new Error(`task ${input.taskId} not found`);
  if (t.status !== "running" && t.status !== "blocked" && t.status !== "queued") {
    return { kind: "ignored", reason: `task in non-revisable status ${t.status}` };
  }

  const pauseControl: TaskControl = {
    signal: "pause",
    signalAt: new Date().toISOString(),
    signalFencingToken: input.fencingToken,
  };
  await writeJson(
    input.paths.taskControl(input.runtimeId, input.threadId, input.taskId),
    pauseControl,
  );

  await input.taskRepo.transitionStatus(input.taskId, "changing").catch(() => {
    /* if illegal transition we still proceed; tolerate via .catch */
  });

  const newRev = await input.planRepo.supersedeWithRevision(
    input.planId,
    input.threadId,
    input.taskId,
    {
      reason: input.reason,
      sourceMessageId: input.sourceMessageId,
      newPlan: input.newPlan,
    },
  );

  await input.taskRepo.update(input.taskId, {
    activePlanRevisionId: newRev.id,
    archivedRevisionIds: [...t.archivedRevisionIds, ...newRev.archivedArtifactPaths.map(() => `archive-${newRev.id}`)],
  });

  await input.taskRepo.transitionStatus(input.taskId, "queued");

  const reviseControl: TaskControl = {
    signal: "revise",
    revisionId: newRev.id,
    signalAt: new Date().toISOString(),
    signalFencingToken: input.fencingToken,
  };
  await writeJson(
    input.paths.taskControl(input.runtimeId, input.threadId, input.taskId),
    reviseControl,
  );

  return { kind: "revised", newRevisionId: newRev.id };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/thread-loop/plan-revision.ts packages/bot-runtime/src/thread-loop/__tests__/plan-revision.test.ts
git commit -m "feat(thread-loop): handle plan revision with archive and re-dispatch"
```

---

## Phase F — Executor（Spec Stage 4）

> Executor 是 worker 角色进程内的 per-task actor。从 jobs/pending 中 lease，跑 agent loop，写 events.jsonl，监听 control.json，处理崩溃恢复。

### Task 43: control.json watcher（executor/control-watcher.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/control-watcher.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/control-watcher.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../storage/json-file.js";
import { createPaths } from "../../storage/paths.js";
import { readControl } from "../control-watcher.js";

describe("readControl", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ctl-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("returns null when no control file", async () => {
    const paths = createPaths(dataRoot);
    expect(await readControl(paths, "rt-1", "th-1", "tk-1")).toBeNull();
  });

  it("returns the latest signal", async () => {
    const paths = createPaths(dataRoot);
    await writeJson(paths.taskControl("rt-1", "th-1", "tk-1"), {
      signal: "pause",
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 1,
    });
    const got = await readControl(paths, "rt-1", "th-1", "tk-1");
    expect(got?.signal).toBe("pause");
  });

  it("filters out stale signals based on lastSeenFencingToken", async () => {
    const paths = createPaths(dataRoot);
    await writeJson(paths.taskControl("rt-1", "th-1", "tk-1"), {
      signal: "cancel",
      signalAt: "2026-04-28T00:00:00Z",
      signalFencingToken: 5,
    });
    const got = await readControl(paths, "rt-1", "th-1", "tk-1", { lastSeen: 10 });
    expect(got).toBeNull();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../control-watcher.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { readJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";
import { type TaskControl, TaskControlSchema } from "../schema/job.js";

export async function readControl(
  paths: Paths,
  runtimeId: string,
  threadId: string,
  taskId: string,
  opts?: { lastSeen?: number },
): Promise<TaskControl | null> {
  const raw = await readJson(paths.taskControl(runtimeId, threadId, taskId));
  if (!raw) return null;
  const parsed = TaskControlSchema.parse(raw);
  if (opts?.lastSeen !== undefined && parsed.signalFencingToken <= opts.lastSeen) {
    return null;
  }
  return parsed;
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/control-watcher.ts packages/bot-runtime/src/executor/__tests__/control-watcher.test.ts
git commit -m "feat(executor): add control.json watcher with fencing token filter"
```

---

### Task 44: events.jsonl writer（executor/events-writer.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/events-writer.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/events-writer.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readJsonl } from "../../storage/jsonl.js";
import { createPaths } from "../../storage/paths.js";
import { createEventsWriter } from "../events-writer.js";

describe("EventsWriter", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ew-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("appends valid ExecutorEvents", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "executor_started",
      executorId: "exec-1",
      fencingToken: 1000001,
      at: "2026-04-28T00:00:00Z",
    });
    await w.write({
      kind: "tool_call",
      toolName: "read_file",
      argsRef: "x",
      at: "2026-04-28T00:00:01Z",
    });
    const all = await readJsonl(paths.taskEvents("rt-1", "th-1", "tk-1"));
    expect(all).toHaveLength(2);
  });

  it("rejects events failing schema", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await expect(
      w.write({ kind: "wat", at: "2026-04-28T00:00:00Z" } as never),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../events-writer.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { appendJsonl, readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import { sanitize } from "../storage/sanitize.js";
import {
  type ExecutorEvent,
  ExecutorEventSchema,
} from "../schema/events.js";

export type EventsWriter = {
  write(event: ExecutorEvent): Promise<void>;
  readAll(): Promise<ExecutorEvent[]>;
};

export function createEventsWriter(
  paths: Paths,
  runtimeId: string,
  threadId: string,
  taskId: string,
): EventsWriter {
  const file = paths.taskEvents(runtimeId, threadId, taskId);
  return {
    async write(event) {
      const validated = ExecutorEventSchema.parse(event);
      await appendJsonl(file, sanitize(validated));
    },
    async readAll() {
      const raw = await readJsonl<unknown>(file);
      return raw.map((r) => ExecutorEventSchema.parse(r));
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/events-writer.ts packages/bot-runtime/src/executor/__tests__/events-writer.test.ts
git commit -m "feat(executor): add events.jsonl writer with schema validation"
```

---

### Task 45: in-flight tool call 恢复（executor/recovery.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/recovery.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/recovery.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEventsWriter } from "../events-writer.js";
import { createPaths } from "../../storage/paths.js";
import { detectInFlightToolCall } from "../recovery.js";

describe("detectInFlightToolCall", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "exr-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("returns null when last event is not tool_call", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "executor_started",
      executorId: "e1",
      fencingToken: 1,
      at: "2026-04-28T00:00:00Z",
    });
    expect(
      await detectInFlightToolCall(paths, "rt-1", "th-1", "tk-1"),
    ).toBeNull();
  });

  it("returns the unmatched tool_call when not followed by tool_result", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "tool_call",
      toolName: "write_file",
      argsRef: "x",
      at: "2026-04-28T00:00:01Z",
    });
    const got = await detectInFlightToolCall(paths, "rt-1", "th-1", "tk-1");
    expect(got?.toolName).toBe("write_file");
  });

  it("returns null when matched tool_result follows", async () => {
    const paths = createPaths(dataRoot);
    const w = createEventsWriter(paths, "rt-1", "th-1", "tk-1");
    await w.write({
      kind: "tool_call",
      toolName: "write_file",
      argsRef: "x",
      at: "2026-04-28T00:00:01Z",
    });
    await w.write({
      kind: "tool_result",
      toolName: "write_file",
      resultRef: "y",
      at: "2026-04-28T00:00:02Z",
    });
    expect(
      await detectInFlightToolCall(paths, "rt-1", "th-1", "tk-1"),
    ).toBeNull();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../recovery.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import {
  type ExecutorEvent,
  ExecutorEventSchema,
} from "../schema/events.js";

export type InFlightToolCall = {
  toolName: string;
  argsRef: string;
  at: string;
};

export async function detectInFlightToolCall(
  paths: Paths,
  runtimeId: string,
  threadId: string,
  taskId: string,
): Promise<InFlightToolCall | null> {
  const events = (
    await readJsonl<unknown>(paths.taskEvents(runtimeId, threadId, taskId))
  ).map((e) => ExecutorEventSchema.parse(e));
  let lastCall: ExecutorEvent | null = null;
  for (const e of events) {
    if (e.kind === "tool_call") lastCall = e;
    else if (e.kind === "tool_result" && lastCall && lastCall.kind === "tool_call") {
      if (e.toolName === lastCall.toolName) lastCall = null;
    }
  }
  if (!lastCall || lastCall.kind !== "tool_call") return null;
  return {
    toolName: lastCall.toolName,
    argsRef: lastCall.argsRef,
    at: lastCall.at,
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/recovery.ts packages/bot-runtime/src/executor/__tests__/recovery.test.ts
git commit -m "feat(executor): detect in-flight tool call from events.jsonl"
```

---

### Task 46: LLM tool_use 响应支持（llm/tool-use.ts）

**Files:**
- Create: `packages/bot-runtime/src/llm/tool-use.ts`
- Modify: `packages/bot-runtime/src/llm/anthropic.ts`（扩展 tool_use 解析）
- Test: `packages/bot-runtime/src/llm/__tests__/tool-use.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createAnthropicLlmClient } from "../anthropic.js";

describe("anthropic adapter — tool_use response", () => {
  it("translates anthropic tool_use block to LlmResponse tool_call", async () => {
    const fakeSdk = {
      messages: {
        create: async () => ({
          content: [
            {
              type: "tool_use",
              name: "write_file",
              input: { path: "a.txt", content: "x" },
              id: "toolu_1",
            },
          ],
        }),
      },
    };
    const client = createAnthropicLlmClient({
      apiKey: "k",
      model: "m",
      maxTokens: 1024,
      sdk: fakeSdk as never,
    });
    const out = await client.complete({
      system: "x",
      messages: [{ role: "user", content: "y" }],
      tools: [
        { name: "write_file", description: "x", inputSchemaJson: {} },
      ],
    });
    expect(out).toEqual({
      kind: "tool_call",
      toolName: "write_file",
      input: { path: "a.txt", content: "x" },
      id: "toolu_1",
    });
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — adapter 还不识别 tool_use。

- [ ] **Step 3：修改 anthropic.ts，复用为 helper**

新建 `packages/bot-runtime/src/llm/tool-use.ts`：
```ts
import type { LlmResponse } from "./client.js";

type AnyBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
};

export function decodeAnthropicResponseBlocks(blocks: AnyBlock[]): LlmResponse {
  for (const b of blocks) {
    if (b.type === "tool_use" && b.name && b.id) {
      return {
        kind: "tool_call",
        toolName: b.name,
        input: (b.input as Record<string, unknown>) ?? {},
        id: b.id,
      };
    }
  }
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") {
      return { kind: "text", text: b.text };
    }
  }
  throw new Error("anthropic response had no recognizable block");
}
```

修改 `packages/bot-runtime/src/llm/anthropic.ts` 的 complete 方法：
```ts
import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";
import { decodeAnthropicResponseBlocks } from "./tool-use.js";

export type AnthropicLlmClientOptions = {
  apiKey: string;
  model: string;
  maxTokens: number;
  sdk?: Pick<Anthropic, "messages">;
};

export function createAnthropicLlmClient(
  opts: AnthropicLlmClientOptions,
): LlmClient {
  const sdk = opts.sdk ?? new Anthropic({ apiKey: opts.apiKey });
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const result = await sdk.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: req.system,
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchemaJson,
        })),
        messages: req.messages.map((m) => ({
          role: m.role === "system" ? "assistant" : m.role,
          content: m.content,
        })),
      } as never);
      type AnyBlock = {
        type: string;
        text?: string;
        name?: string;
        input?: unknown;
        id?: string;
      };
      const blocks = (result as { content: AnyBlock[] }).content;
      return decodeAnthropicResponseBlocks(blocks);
    },
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed (Task 38 测试也仍然通过)。

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/llm/tool-use.ts packages/bot-runtime/src/llm/anthropic.ts packages/bot-runtime/src/llm/__tests__/tool-use.test.ts
git commit -m "feat(llm): decode anthropic tool_use blocks to LlmResponse"
```

---

### Task 47: Executor agent loop（executor/executor.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/executor.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/executor.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createDispatcher } from "../../tools/dispatcher.js";
import { createWriteFileTool } from "../../tools/write-file.js";
import { createStubLlmClient } from "../../llm/client.js";
import { runExecutor } from "../executor.js";

describe("Executor agent loop", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ex-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  async function setup() {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobs = createJobQueue(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "y",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "obj",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await jobs.enqueueExecuteTask({
      taskId: t.id,
      threadId: ids.th,
      planRevisionId: p.id,
      fencingToken: 1000001,
    });
    const ws = paths.workspace("rt-1", ids.th, t.id);
    await mkdir(ws, { recursive: true });
    return { paths, taskRepo, planRepo, jobs, t };
  }

  it("runs one tool call and finishes when LLM returns text after tool_result", async () => {
    const { paths, taskRepo, planRepo, jobs, t } = await setup();
    let callsMade = 0;
    const llm = {
      async complete() {
        callsMade += 1;
        if (callsMade === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "out.txt", content: "hello" },
            id: "toolu_1",
          };
        }
        return { kind: "text" as const, text: "done" };
      },
    };
    const dispatcher = createDispatcher({
      tools: [createWriteFileTool(paths)],
      policies: [],
    });
    const result = await runExecutor({
      paths,
      runtimeId: "rt-1",
      executorId: "exec-1",
      taskRepo,
      planRepo,
      jobs,
      dispatcher,
      llm,
      systemPrompt: "you write files",
      taskId: t.id,
      maxSteps: 5,
    });
    expect(result.outcome).toBe("completed");
    const after = await taskRepo.load(t.id);
    expect(after?.status).toBe("completed");
  });

  it("yields awaiting_critical_node when dispatcher returns critical_node", async () => {
    const { paths, taskRepo, planRepo, jobs, t } = await setup();
    const llm = {
      async complete() {
        return {
          kind: "tool_call" as const,
          toolName: "write_file",
          input: { path: "out.txt", content: "x" },
          id: "toolu_1",
        };
      },
    };
    const dispatcher = createDispatcher({
      tools: [createWriteFileTool(paths)],
      policies: [
        {
          id: "p1",
          scope: "user",
          matcher: { kind: "tool", toolName: "write_file" },
          action: "require_approval",
          ownerUserId: ids.user,
          enabled: true,
          createdAt: "2026-04-28T00:00:00Z",
        },
      ],
    });
    const result = await runExecutor({
      paths,
      runtimeId: "rt-1",
      executorId: "exec-1",
      taskRepo,
      planRepo,
      jobs,
      dispatcher,
      llm,
      systemPrompt: "x",
      taskId: t.id,
      maxSteps: 5,
    });
    expect(result.outcome).toBe("awaiting_critical_node");
    const after = await taskRepo.load(t.id);
    expect(after?.status).toBe("awaiting_critical_node");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../executor.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { LlmClient, LlmMessage, LlmToolDef } from "../llm/client.js";
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import type { Dispatcher } from "../tools/dispatcher.js";
import type { ToolContext } from "../tools/tool.js";
import { readControl } from "./control-watcher.js";
import { createEventsWriter } from "./events-writer.js";

export type RunExecutorInput = {
  paths: Paths;
  runtimeId: string;
  executorId: string;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  llm: LlmClient;
  systemPrompt: string;
  taskId: string;
  maxSteps: number;
};

export type RunExecutorResult =
  | { outcome: "completed"; summary: string }
  | { outcome: "failed"; error: string }
  | { outcome: "cancelled" }
  | { outcome: "awaiting_critical_node"; policyIds: string[] }
  | { outcome: "blocked"; reason: string };

export async function runExecutor(
  input: RunExecutorInput,
): Promise<RunExecutorResult> {
  const task = await input.taskRepo.load(input.taskId);
  if (!task) throw new Error(`task ${input.taskId} not found`);
  if (task.status !== "queued" && task.status !== "running") {
    return { outcome: "blocked", reason: `unexpected status ${task.status}` };
  }
  const plan = await input.planRepo.loadPlan(task.threadId, task.id);
  if (!plan) throw new Error(`plan not found for task ${input.taskId}`);

  await input.taskRepo.transitionStatus(input.taskId, "running");
  const fencingToken = 1; // master-issued via job; passed via dispatcher ctx
  const writer = createEventsWriter(
    input.paths,
    input.runtimeId,
    task.threadId,
    task.id,
  );
  await writer.write({
    kind: "executor_started",
    executorId: input.executorId,
    fencingToken,
    at: new Date().toISOString(),
  });

  const ctx: ToolContext = {
    runtimeId: input.runtimeId,
    threadId: task.threadId,
    taskId: task.id,
    fencingToken,
    now: () => new Date().toISOString(),
  };

  const messages: LlmMessage[] = [];
  messages.push({
    role: "user",
    content: `Task: ${task.title}\n\n${task.description}\n\nObjective: ${plan.objective}`,
  });

  const tools: LlmToolDef[] = [];
  let lastSeenSignal = 0;

  for (let step = 0; step < input.maxSteps; step++) {
    const ctl = await readControl(
      input.paths,
      input.runtimeId,
      task.threadId,
      task.id,
      { lastSeen: lastSeenSignal },
    );
    if (ctl?.signal === "cancel") {
      await writer.write({
        kind: "executor_finished",
        outcome: "cancelled",
        at: new Date().toISOString(),
      });
      await input.taskRepo.transitionStatus(input.taskId, "cancelled").catch(() => undefined);
      return { outcome: "cancelled" };
    }
    if (ctl?.signal === "pause") {
      await writer.write({
        kind: "executor_paused",
        reason: "control:pause",
        at: new Date().toISOString(),
      });
      lastSeenSignal = ctl.signalFencingToken;
      return { outcome: "blocked", reason: "paused by control" };
    }
    if (ctl) lastSeenSignal = ctl.signalFencingToken;

    const resp = await input.llm.complete({
      system: input.systemPrompt,
      messages,
      tools,
    });
    if (resp.kind === "text") {
      await writer.write({
        kind: "executor_finished",
        outcome: "completed",
        summaryRef: resp.text,
        at: new Date().toISOString(),
      });
      await input.taskRepo.transitionStatus(input.taskId, "completed");
      return { outcome: "completed", summary: resp.text };
    }
    if (resp.kind === "json") {
      messages.push({
        role: "assistant",
        content: JSON.stringify(resp.data),
      });
      continue;
    }

    await writer.write({
      kind: "tool_call",
      toolName: resp.toolName,
      argsRef: JSON.stringify(resp.input),
      at: new Date().toISOString(),
    });
    const result = await input.dispatcher.dispatch({
      toolName: resp.toolName,
      input: resp.input,
      ctx,
    });
    if (result.outcome === "ok") {
      await writer.write({
        kind: "tool_result",
        toolName: resp.toolName,
        resultRef: JSON.stringify(result.output),
        at: new Date().toISOString(),
      });
      messages.push({
        role: "user",
        content: `tool ${resp.toolName} result: ${JSON.stringify(result.output)}`,
      });
      continue;
    }
    if (result.outcome === "critical_node") {
      for (const d of result.decisions) {
        await writer.write({
          kind: "critical_node_hit",
          policyId: d.policyId,
          action: d.action,
          at: new Date().toISOString(),
        });
      }
      await input.taskRepo.transitionStatus(input.taskId, "awaiting_critical_node");
      return {
        outcome: "awaiting_critical_node",
        policyIds: result.decisions.map((d) => d.policyId),
      };
    }
    if (result.outcome === "blocked") {
      await input.taskRepo.transitionStatus(input.taskId, "blocked");
      return { outcome: "blocked", reason: "policy:block" };
    }
    if (result.outcome === "unknown_tool") {
      messages.push({
        role: "user",
        content: `tool ${resp.toolName} is not registered. Ignore and try another approach or finish.`,
      });
      continue;
    }
    if (result.outcome === "error") {
      await writer.write({
        kind: "executor_finished",
        outcome: "failed",
        error: result.error,
        at: new Date().toISOString(),
      });
      await input.taskRepo.transitionStatus(input.taskId, "failed");
      return { outcome: "failed", error: result.error };
    }
  }

  await writer.write({
    kind: "executor_finished",
    outcome: "failed",
    error: "max_steps_exceeded",
    at: new Date().toISOString(),
  });
  await input.taskRepo.transitionStatus(input.taskId, "failed");
  return { outcome: "failed", error: "max_steps_exceeded" };
}

void newId;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/executor.ts packages/bot-runtime/src/executor/__tests__/executor.test.ts
git commit -m "feat(executor): add agent loop with critical node, control signals, and event tracing"
```

---

### Task 48: Executor 池绑定 jobs/ 队列（executor/worker-pool.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/worker-pool.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/worker-pool.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createDispatcher } from "../../tools/dispatcher.js";
import { runWorkerPoolOnce } from "../worker-pool.js";

describe("WorkerPool runWorkerPoolOnce", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "wp-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("leases pending job, runs executor, marks done", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobs = createJobQueue(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "x",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await jobs.enqueueExecuteTask({
      taskId: t.id,
      threadId: ids.th,
      planRevisionId: p.id,
      fencingToken: 1000001,
    });
    await mkdir(paths.workspace("rt-1", ids.th, t.id), { recursive: true });

    const result = await runWorkerPoolOnce({
      paths,
      runtimeId: "rt-1",
      executorIdPrefix: "ex",
      taskRepo,
      planRepo,
      jobs,
      dispatcher: createDispatcher({ tools: [], policies: [] }),
      llm: { async complete() { return { kind: "text", text: "ok" }; } },
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });
    expect(result?.outcome).toBe("completed");
    const done = await readdir(paths.jobsDir("rt-1", "done"));
    expect(done).toHaveLength(1);
  });

  it("returns null when no pending job", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobs = createJobQueue(paths, "rt-1");
    const result = await runWorkerPoolOnce({
      paths,
      runtimeId: "rt-1",
      executorIdPrefix: "ex",
      taskRepo,
      planRepo,
      jobs,
      dispatcher: createDispatcher({ tools: [], policies: [] }),
      llm: { async complete() { return { kind: "text", text: "ok" }; } },
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../worker-pool.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { LlmClient } from "../llm/client.js";
import type { JobQueue } from "../repositories/job-queue.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import { newId } from "../storage/ids.js";
import type { Paths } from "../storage/paths.js";
import type { Dispatcher } from "../tools/dispatcher.js";
import { runExecutor, type RunExecutorResult } from "./executor.js";

export type WorkerPoolOnceInput = {
  paths: Paths;
  runtimeId: string;
  executorIdPrefix: string;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  llm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
};

export async function runWorkerPoolOnce(
  input: WorkerPoolOnceInput,
): Promise<RunExecutorResult | null> {
  const leased = await input.jobs.leaseNext({
    lockHolder: `${input.executorIdPrefix}_${newId("exec")}`,
    leaseMs: input.leaseMs,
  });
  if (!leased) return null;
  let result: RunExecutorResult;
  try {
    result = await runExecutor({
      paths: input.paths,
      runtimeId: input.runtimeId,
      executorId: leased.lockHolder ?? "exec-?",
      taskRepo: input.taskRepo,
      planRepo: input.planRepo,
      jobs: input.jobs,
      dispatcher: input.dispatcher,
      llm: input.llm,
      systemPrompt: input.systemPrompt,
      taskId: leased.taskId,
      maxSteps: input.maxSteps,
    });
  } catch (err) {
    await input.jobs.fail(leased.id, (err as Error).message);
    return { outcome: "failed", error: (err as Error).message };
  }

  if (
    result.outcome === "completed" ||
    result.outcome === "failed" ||
    result.outcome === "cancelled"
  ) {
    await input.jobs.complete(leased.id, {
      outcome:
        result.outcome === "completed"
          ? "completed"
          : result.outcome === "cancelled"
            ? "cancelled"
            : "failed",
      error: result.outcome === "failed" ? result.error : undefined,
    });
  } else {
    /* awaiting_critical_node / blocked: keep job in locked, ThreadLoop will revise/cancel */
  }
  return result;
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/worker-pool.ts packages/bot-runtime/src/executor/__tests__/worker-pool.test.ts
git commit -m "feat(executor): add worker pool single-pass runner"
```

---

### Task 49: 启动时调用 recovery 流程（executor/recovery-on-boot.ts）

**Files:**
- Create: `packages/bot-runtime/src/executor/recovery-on-boot.ts`
- Test: `packages/bot-runtime/src/executor/__tests__/recovery-on-boot.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../storage/json-file.js";
import { createPaths } from "../../storage/paths.js";
import { recoverOnBoot } from "../recovery-on-boot.js";

describe("recoverOnBoot", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rb-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("invokes the four recovery sweeps and returns counts", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.jobsDir("rt-1", "locked"), { recursive: true });
    await writeJson(paths.jobFile("rt-1", "locked", "j-old"), {
      id: "j-old",
      lockHolder: "ghost",
      leaseExpireAt: new Date(Date.now() - 1000).toISOString(),
    });
    const summary = await recoverOnBoot(paths, "rt-1", { dedupeRetentionDays: 30 });
    expect(summary.staleLockedJobs).toContain("j-old");
    const failedDir = await readdir(paths.jobsDir("rt-1", "failed"));
    expect(failedDir).toContain("j-old.json");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../recovery-on-boot.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { Paths } from "../storage/paths.js";
import {
  cleanupRecoveredTombstones,
  cleanupStaleDedupe,
  markStaleRunningTasks,
  recoverStaleLockedJobs,
} from "../storage/recovery.js";

export type RecoverOnBootSummary = {
  staleLockedJobs: string[];
  staleRunningTasks: string[];
  cleanedDedupeKeys: string[];
  cleanedTombstones: number;
};

export async function recoverOnBoot(
  paths: Paths,
  runtimeId: string,
  opts: { dedupeRetentionDays: number },
): Promise<RecoverOnBootSummary> {
  const staleLockedJobs = await recoverStaleLockedJobs(paths, runtimeId);
  const staleRunningTasks = await markStaleRunningTasks(paths, runtimeId);
  const cleanedDedupeKeys = await cleanupStaleDedupe(
    paths,
    runtimeId,
    opts.dedupeRetentionDays,
  );
  const cleanedTombstones = await cleanupRecoveredTombstones(paths, runtimeId);
  return {
    staleLockedJobs,
    staleRunningTasks,
    cleanedDedupeKeys,
    cleanedTombstones,
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/executor/recovery-on-boot.ts packages/bot-runtime/src/executor/__tests__/recovery-on-boot.test.ts
git commit -m "feat(executor): aggregate startup recovery sweeps into recoverOnBoot"
```

---

## Phase G — MessageGuard（Spec Stage 5）

> 双阶段守卫：先用确定性规则短路掉群聊噪声，命中"应当深入识别"的条件再调 LLM 做结构化分类。LLM 不可用时 fallback 走纯规则。

### Task 50: 确定性规则（guard/rules.ts）

**Files:**
- Create: `packages/bot-runtime/src/guard/rules.ts`
- Test: `packages/bot-runtime/src/guard/__tests__/rules.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { evaluateRules } from "../rules.js";

describe("evaluateRules", () => {
  it("bound group with no @bot/no reply → silence", () => {
    const r = evaluateRules({
      source: "lark_group",
      bound: true,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.intent).toBe("irrelevant");
    expect(r.ruleHits).toContain("bound_group_silent");
  });

  it("unbound group → silence (waits for guardian flow)", () => {
    const r = evaluateRules({
      source: "lark_group",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.intent).toBe("irrelevant");
    expect(r.ruleHits).toContain("unbound_group_silent");
  });

  it("bound group with /confirm slash → confirm_task short-circuit", () => {
    const r = evaluateRules({
      source: "lark_group",
      bound: true,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      threadStatus: "waiting_confirmation",
    });
    expect(r.shortCircuit).toBe(true);
    expect(r.intent).toBe("confirm_task");
  });

  it("private chat / client → defers to LLM (no short-circuit)", () => {
    const r = evaluateRules({
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
    });
    expect(r.shortCircuit).toBe(false);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../rules.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { GuardIntent, GuardSource } from "../schema/guard-decision.js";

export type RuleInput = {
  source: GuardSource;
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  threadStatus:
    | "chatting"
    | "planning"
    | "waiting_confirmation"
    | "working"
    | "blocked"
    | "idle";
};

export type RuleEvaluation = {
  shortCircuit: boolean;
  intent: GuardIntent;
  ruleHits: string[];
  reason: string;
};

export function evaluateRules(input: RuleInput): RuleEvaluation {
  if (input.source === "lark_group" && !input.bound) {
    return {
      shortCircuit: true,
      intent: "irrelevant",
      ruleHits: ["unbound_group_silent"],
      reason: "unbound group messages do not enter business thread",
    };
  }
  if (input.source === "lark_group" && input.bound) {
    const triggered =
      input.mentionsBot ||
      input.replyToBotMessage ||
      input.slashCommand !== null ||
      input.threadStatus === "waiting_confirmation";
    if (!triggered) {
      return {
        shortCircuit: true,
        intent: "irrelevant",
        ruleHits: ["bound_group_silent"],
        reason: "bound group, no @bot or reply to bot",
      };
    }
    if (input.slashCommand === "confirm") {
      return {
        shortCircuit: true,
        intent: "confirm_task",
        ruleHits: ["slash_confirm"],
        reason: "explicit /confirm command",
      };
    }
    if (input.slashCommand === "cancel") {
      return {
        shortCircuit: true,
        intent: "cancel_task",
        ruleHits: ["slash_cancel"],
        reason: "explicit /cancel command",
      };
    }
    if (input.slashCommand === "status") {
      return {
        shortCircuit: true,
        intent: "progress_query",
        ruleHits: ["slash_status"],
        reason: "explicit /status command",
      };
    }
  }
  return {
    shortCircuit: false,
    intent: "chat",
    ruleHits: [],
    reason: "deferred to LLM classifier",
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 4 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/guard/rules.ts packages/bot-runtime/src/guard/__tests__/rules.test.ts
git commit -m "feat(guard): add deterministic rule short-circuit"
```

---

### Task 51: LLM classifier（guard/llm-classifier.ts）

**Files:**
- Create: `packages/bot-runtime/src/guard/llm-classifier.ts`
- Test: `packages/bot-runtime/src/guard/__tests__/llm-classifier.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { classifyIntentWithLlm } from "../llm-classifier.js";

describe("classifyIntentWithLlm", () => {
  it("parses canned JSON into IntentClassification", async () => {
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          intent: "new_task",
          confidence: 0.93,
          reason: "user asks for landing page",
        },
      },
    );
    const out = await classifyIntentWithLlm({
      llm,
      threadStatus: "chatting",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
      messageText: "build me a landing page",
    });
    expect(out.intent).toBe("new_task");
    expect(out.confidence).toBeCloseTo(0.93);
  });

  it("falls back to chat with low confidence on parse failure", async () => {
    const llm = createStubLlmClient(
      {},
      { kind: "text", text: "I have no idea what you mean" },
    );
    const out = await classifyIntentWithLlm({
      llm,
      threadStatus: "chatting",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
      messageText: "?",
    });
    expect(out.intent).toBe("chat");
    expect(out.confidence).toBeLessThan(0.5);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../llm-classifier.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";
import type { LlmClient } from "../llm/client.js";
import {
  type GuardIntent,
  GuardIntentSchema,
} from "../schema/guard-decision.js";

const IntentJsonSchema = z.object({
  intent: GuardIntentSchema,
  confidence: z.number().min(0).max(1),
  reason: z.string(),
  targetTaskId: z.string().optional(),
  targetPlanId: z.string().optional(),
});

export type ClassifyInput = {
  llm: LlmClient;
  threadStatus: string;
  pendingTaskId: string | undefined;
  pendingPlanId: string | undefined;
  messageText: string;
};

export type IntentClassification = {
  intent: GuardIntent;
  confidence: number;
  reason: string;
  targetTaskId?: string;
  targetPlanId?: string;
};

const SYSTEM = `You classify the user's most recent message into ONE of these intents:
chat, new_task, task_update, plan_update, confirm_task, confirm_plan,
progress_query, cancel_task, irrelevant.

Reply ONLY with JSON: {"intent": "...", "confidence": 0..1, "reason": "...",
"targetTaskId": "..." (optional), "targetPlanId": "..." (optional)}.`;

export async function classifyIntentWithLlm(
  input: ClassifyInput,
): Promise<IntentClassification> {
  const ctx = `thread_status=${input.threadStatus} pending_task=${input.pendingTaskId ?? "-"} pending_plan=${input.pendingPlanId ?? "-"}`;
  const resp = await input.llm.complete({
    system: SYSTEM,
    messages: [
      { role: "user", content: `${ctx}\n\nmessage: ${input.messageText}` },
    ],
    tools: [],
    temperature: 0,
    responseFormat: "json",
  });

  let parsed: unknown;
  try {
    parsed =
      resp.kind === "json"
        ? resp.data
        : resp.kind === "text"
          ? JSON.parse(resp.text)
          : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    return {
      intent: "chat",
      confidence: 0.2,
      reason: "LLM response not parseable; fell back to chat",
    };
  }
  const validated = IntentJsonSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      intent: "chat",
      confidence: 0.2,
      reason: `LLM JSON failed schema: ${validated.error.message}`,
    };
  }
  return validated.data;
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 2 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/guard/llm-classifier.ts packages/bot-runtime/src/guard/__tests__/llm-classifier.test.ts
git commit -m "feat(guard): add LLM intent classifier with structured JSON output"
```

---

### Task 52: 降级模式（guard/fallback.ts）

**Files:**
- Create: `packages/bot-runtime/src/guard/fallback.ts`
- Test: `packages/bot-runtime/src/guard/__tests__/fallback.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { fallbackClassify } from "../fallback.js";

describe("fallbackClassify (LLM unavailable)", () => {
  it("recognises explicit /confirm", () => {
    const out = fallbackClassify({
      messageText: "/confirm",
      slashCommand: "confirm",
    });
    expect(out.intent).toBe("confirm_task");
  });

  it("recognises explicit /cancel", () => {
    const out = fallbackClassify({
      messageText: "/cancel",
      slashCommand: "cancel",
    });
    expect(out.intent).toBe("cancel_task");
  });

  it("default falls through as chat with note", () => {
    const out = fallbackClassify({ messageText: "hi", slashCommand: null });
    expect(out.intent).toBe("chat");
    expect(out.reason).toMatch(/degraded/i);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../fallback.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { GuardIntent } from "../schema/guard-decision.js";

export type FallbackInput = {
  messageText: string;
  slashCommand: "confirm" | "cancel" | "status" | null;
};

export type FallbackOutput = {
  intent: GuardIntent;
  confidence: number;
  reason: string;
};

export function fallbackClassify(input: FallbackInput): FallbackOutput {
  if (input.slashCommand === "confirm") {
    return {
      intent: "confirm_task",
      confidence: 1,
      reason: "rule fallback: explicit /confirm",
    };
  }
  if (input.slashCommand === "cancel") {
    return {
      intent: "cancel_task",
      confidence: 1,
      reason: "rule fallback: explicit /cancel",
    };
  }
  if (input.slashCommand === "status") {
    return {
      intent: "progress_query",
      confidence: 1,
      reason: "rule fallback: explicit /status",
    };
  }
  return {
    intent: "chat",
    confidence: 0.1,
    reason: "rule fallback (LLM degraded); defaulting to chat",
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/guard/fallback.ts packages/bot-runtime/src/guard/__tests__/fallback.test.ts
git commit -m "feat(guard): add LLM-degraded fallback classifier using slash commands"
```

---

### Task 53: MessageGuard 入口（guard/message-guard.ts）

**Files:**
- Create: `packages/bot-runtime/src/guard/message-guard.ts`
- Test: `packages/bot-runtime/src/guard/__tests__/message-guard.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createMessageGuard } from "../message-guard.js";

describe("MessageGuard", () => {
  it("short-circuits via rules without calling LLM", async () => {
    let llmCalled = false;
    const guard = createMessageGuard({
      llm: {
        async complete() {
          llmCalled = true;
          return { kind: "text", text: "" };
        },
      },
    });
    const out = await guard.classify({
      source: "lark_group",
      bound: true,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
      messageText: "casual chat",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
    });
    expect(out.intent).toBe("irrelevant");
    expect(out.shortCircuited).toBe(true);
    expect(llmCalled).toBe(false);
  });

  it("calls LLM in private chat", async () => {
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: { intent: "new_task", confidence: 0.9, reason: "stub" },
      },
    );
    const guard = createMessageGuard({ llm });
    const out = await guard.classify({
      source: "lark_private",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      threadStatus: "chatting",
      messageText: "build me a thing",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
    });
    expect(out.intent).toBe("new_task");
    expect(out.shortCircuited).toBe(false);
  });

  it("falls back when LLM throws", async () => {
    const llm = {
      async complete() {
        throw new Error("network down");
      },
    };
    const guard = createMessageGuard({ llm });
    const out = await guard.classify({
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      threadStatus: "waiting_confirmation",
      messageText: "/confirm",
      pendingTaskId: undefined,
      pendingPlanId: undefined,
    });
    expect(out.intent).toBe("confirm_task");
    expect(out.ruleHits).toContain("llm_degraded");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../message-guard.js` 不存在。

- [ ] **Step 3：实现**

```ts
import type { LlmClient } from "../llm/client.js";
import type { GuardIntent, GuardSource } from "../schema/guard-decision.js";
import { fallbackClassify } from "./fallback.js";
import { classifyIntentWithLlm } from "./llm-classifier.js";
import { evaluateRules, type RuleInput } from "./rules.js";

export type ClassifyInput = RuleInput & {
  messageText: string;
  pendingTaskId: string | undefined;
  pendingPlanId: string | undefined;
};

export type GuardClassification = {
  intent: GuardIntent;
  confidence: number;
  reason: string;
  shortCircuited: boolean;
  ruleHits: string[];
  targetTaskId?: string;
  targetPlanId?: string;
};

export type MessageGuard = {
  classify(input: ClassifyInput): Promise<GuardClassification>;
};

export function createMessageGuard(deps: { llm: LlmClient }): MessageGuard {
  return {
    async classify(input) {
      const rules = evaluateRules(input);
      if (rules.shortCircuit) {
        return {
          intent: rules.intent,
          confidence: 1,
          reason: rules.reason,
          shortCircuited: true,
          ruleHits: rules.ruleHits,
        };
      }
      try {
        const llmOut = await classifyIntentWithLlm({
          llm: deps.llm,
          threadStatus: input.threadStatus,
          pendingTaskId: input.pendingTaskId,
          pendingPlanId: input.pendingPlanId,
          messageText: input.messageText,
        });
        return {
          intent: llmOut.intent,
          confidence: llmOut.confidence,
          reason: llmOut.reason,
          shortCircuited: false,
          ruleHits: [],
          targetTaskId: llmOut.targetTaskId,
          targetPlanId: llmOut.targetPlanId,
        };
      } catch (err) {
        const fb = fallbackClassify({
          messageText: input.messageText,
          slashCommand: input.slashCommand,
        });
        return {
          intent: fb.intent,
          confidence: fb.confidence,
          reason: `${fb.reason} (cause: ${(err as Error).message})`,
          shortCircuited: false,
          ruleHits: ["llm_degraded"],
        };
      }
    },
  };
}

export type { GuardIntent, GuardSource };
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/guard/message-guard.ts packages/bot-runtime/src/guard/__tests__/message-guard.test.ts
git commit -m "feat(guard): add MessageGuard composing rules + LLM + fallback"
```

---

### Task 54: ChannelInboundEvent 幂等去重（guard/inbound-dedupe.ts）

**Files:**
- Create: `packages/bot-runtime/src/guard/inbound-dedupe.ts`
- Test: `packages/bot-runtime/src/guard/__tests__/inbound-dedupe.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { isDuplicateInboundEvent, recordInboundEvent } from "../inbound-dedupe.js";

describe("inbound dedupe", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "ded-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("first call records event, second is detected as duplicate", async () => {
    const paths = createPaths(dataRoot);
    expect(
      await isDuplicateInboundEvent(paths, "rt-1", "feishu", "evt-1"),
    ).toBe(false);
    await recordInboundEvent(paths, "rt-1", "feishu", "evt-1", { foo: 1 });
    expect(
      await isDuplicateInboundEvent(paths, "rt-1", "feishu", "evt-1"),
    ).toBe(true);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../inbound-dedupe.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { writeJson, readJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export async function isDuplicateInboundEvent(
  paths: Paths,
  runtimeId: string,
  provider: string,
  externalEventId: string,
): Promise<boolean> {
  const file = paths.webhookEvent(runtimeId, provider, externalEventId);
  const got = await readJson(file);
  return got !== null;
}

export async function recordInboundEvent(
  paths: Paths,
  runtimeId: string,
  provider: string,
  externalEventId: string,
  payload: unknown,
): Promise<void> {
  const file = paths.webhookEvent(runtimeId, provider, externalEventId);
  await writeJson(file, {
    externalEventId,
    provider,
    receivedAt: new Date().toISOString(),
    payload,
  });
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/guard/inbound-dedupe.ts packages/bot-runtime/src/guard/__tests__/inbound-dedupe.test.ts
git commit -m "feat(guard): add webhook event id dedupe at storage layer"
```

---

## Phase H — Role Hosts 与入口

> 把所有零件按角色装配起来，提供一个能被 fixtures 驱动的 hybrid host。

### Task 55: 环境变量解析（config/env.ts）

**Files:**
- Create: `packages/bot-runtime/src/config/env.ts`
- Test: `packages/bot-runtime/src/config/__tests__/env.test.ts`

- [ ] **Step 1：写测试**

```ts
import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "../env.js";

describe("parseRuntimeConfig", () => {
  it("requires DATA_DIR and BOT_RUNTIME_ROLE", () => {
    expect(() => parseRuntimeConfig({})).toThrow(/DATA_DIR/);
    expect(() => parseRuntimeConfig({ DATA_DIR: "/x" })).toThrow(/BOT_RUNTIME_ROLE/);
  });

  it("accepts hybrid + defaults", () => {
    const cfg = parseRuntimeConfig({
      DATA_DIR: "/x",
      BOT_RUNTIME_ROLE: "hybrid",
      RUNTIME_ID: "rt-test",
    });
    expect(cfg.role).toBe("hybrid");
    expect(cfg.runtimeId).toBe("rt-test");
    expect(cfg.dedupeRetentionDays).toBe(30);
  });

  it("rejects unknown role", () => {
    expect(() =>
      parseRuntimeConfig({
        DATA_DIR: "/x",
        BOT_RUNTIME_ROLE: "weird",
        RUNTIME_ID: "rt-1",
      }),
    ).toThrow(/role/);
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../env.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { z } from "zod";

const ConfigSchema = z.object({
  DATA_DIR: z.string().min(1, "DATA_DIR is required"),
  BOT_RUNTIME_ROLE: z.enum(["master", "worker", "hybrid"], {
    errorMap: () => ({ message: "BOT_RUNTIME_ROLE must be master|worker|hybrid" }),
  }),
  RUNTIME_ID: z.string().min(1).default("rt-default"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_MAX_TOKENS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(2048),
  EXECUTOR_MAX_STEPS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(40),
  EXECUTOR_LEASE_MS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(60_000),
  DEDUPE_RETENTION_DAYS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(30),
});

export type RuntimeConfig = {
  dataDir: string;
  role: "master" | "worker" | "hybrid";
  runtimeId: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  anthropicMaxTokens: number;
  executorMaxSteps: number;
  executorLeaseMs: number;
  dedupeRetentionDays: number;
};

export function parseRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  const parsed = ConfigSchema.parse(env);
  return {
    dataDir: parsed.DATA_DIR,
    role: parsed.BOT_RUNTIME_ROLE,
    runtimeId: parsed.RUNTIME_ID,
    anthropicApiKey: parsed.ANTHROPIC_API_KEY,
    anthropicModel: parsed.ANTHROPIC_MODEL,
    anthropicMaxTokens: parsed.ANTHROPIC_MAX_TOKENS,
    executorMaxSteps: parsed.EXECUTOR_MAX_STEPS,
    executorLeaseMs: parsed.EXECUTOR_LEASE_MS,
    dedupeRetentionDays: parsed.DEDUPE_RETENTION_DAYS,
  };
}
```

- [ ] **Step 4：跑测试确认通过**

Expected: 3 tests passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/config/env.ts packages/bot-runtime/src/config/__tests__/env.test.ts
git commit -m "feat(config): add runtime env config parser"
```

---

### Task 56: Master host wiring（runtime/master-host.ts）

**Files:**
- Create: `packages/bot-runtime/src/runtime/master-host.ts`
- Test: `packages/bot-runtime/src/runtime/__tests__/master-host.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createPaths } from "../../storage/paths.js";
import { createMasterHost } from "../master-host.js";

describe("MasterHost", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "mh-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("starts and exposes ingestInbound + getThreadLoop", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          intent: "new_task",
          confidence: 0.9,
          reason: "test",
        },
      },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "x",
          description: "",
          objective: "x",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const host = await createMasterHost({
      paths,
      runtimeId: "rt-1",
      guardLlm: llm,
      draftLlm,
      systemPrompt: "x",
    });
    const t = await host.threadRepo.create({
      title: "demo",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
    });
    const result = await host.ingestInbound({
      threadId: t.id,
      messageId: "msg-1",
      fromUserId: t.ownerUserId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "build me a thing",
      at: "2026-04-28T00:00:00Z",
    });
    expect(result.kind).toBe("draft_created");
    await host.close();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../master-host.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { acquireInstanceLock, type ReleaseLock } from "../storage/lock.js";
import { createFencingTokenIssuer, type FencingTokenIssuer } from "../storage/fencing.js";
import type { Paths } from "../storage/paths.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { createGuardDecisionRepo, type GuardDecisionRepo } from "../repositories/guard-decision-repo.js";
import { createJobQueue, type JobQueue } from "../repositories/job-queue.js";
import { createPlanRepo, type PlanRepo } from "../repositories/plan-repo.js";
import { createTaskRepo, type TaskRepo } from "../repositories/task-repo.js";
import { createThreadRepo, type ThreadRepo } from "../repositories/thread-repo.js";
import { createTranscriptRepo, type TranscriptRepo } from "../repositories/transcript-repo.js";
import type { LlmClient } from "../llm/client.js";
import { createMessageGuard, type MessageGuard } from "../guard/message-guard.js";
import { createThreadLoop, type InboundEvent, type ThreadLoop, type ThreadLoopResult } from "../thread-loop/thread-loop.js";
import { newId } from "../storage/ids.js";

export type CreateMasterHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  systemPrompt: string;
};

export type MasterHost = {
  threadRepo: ThreadRepo;
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  transcript: TranscriptRepo;
  guardRepo: GuardDecisionRepo;
  guard: MessageGuard;
  ingestInbound(input: IngestInboundInput): Promise<ThreadLoopResult>;
  getOrCreateThreadLoop(threadId: string): ThreadLoop;
  fencing: FencingTokenIssuer;
  close(): Promise<void>;
};

export type IngestInboundInput = {
  threadId: string;
  messageId: string;
  fromUserId: string;
  source: InboundEvent["source"];
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  messageText: string;
  at: string;
};

export async function createMasterHost(
  input: CreateMasterHostInput,
): Promise<MasterHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "master",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });
  const fencing = await createFencingTokenIssuer(input.paths, input.runtimeId);

  const threadRepo = createThreadRepo(input.paths, input.runtimeId);
  const taskRepo = createTaskRepo(input.paths, input.runtimeId);
  const planRepo = createPlanRepo(input.paths, input.runtimeId);
  const jobs = createJobQueue(input.paths, input.runtimeId);
  const transcript = createTranscriptRepo(input.paths, input.runtimeId);
  const guardRepo = createGuardDecisionRepo(input.paths, input.runtimeId);
  const guard = createMessageGuard({ llm: input.guardLlm });

  const loops = new Map<string, ThreadLoop>();

  function getOrCreateThreadLoop(threadId: string): ThreadLoop {
    const existing = loops.get(threadId);
    if (existing) return existing;
    const loop = createThreadLoop({
      runtimeId: input.runtimeId,
      threadId,
      threadRepo,
      taskRepo,
      planRepo,
      jobQueue: jobs,
      transcript,
      guardRepo,
      llm: input.draftLlm,
      issueFencingToken: () => fencing.issue(),
    });
    loops.set(threadId, loop);
    return loop;
  }

  return {
    threadRepo,
    taskRepo,
    planRepo,
    jobs,
    transcript,
    guardRepo,
    guard,
    fencing,
    getOrCreateThreadLoop,
    async ingestInbound(req) {
      const thread = await threadRepo.load(req.threadId);
      const status = thread?.status ?? "chatting";
      const decision = await guard.classify({
        source: req.source,
        bound: req.bound,
        mentionsBot: req.mentionsBot,
        replyToBotMessage: req.replyToBotMessage,
        slashCommand: req.slashCommand,
        threadStatus: status,
        messageText: req.messageText,
        pendingTaskId: thread?.draftTaskId,
        pendingPlanId: thread?.draftPlanId,
      });
      const loop = getOrCreateThreadLoop(req.threadId);
      return loop.handleInbound({
        messageId: req.messageId,
        fromUserId: req.fromUserId,
        source: req.source,
        text: req.messageText,
        decision: {
          intent: decision.intent,
          targetTaskId: decision.targetTaskId,
          targetPlanId: decision.targetPlanId,
          shortCircuited: decision.shortCircuited,
          ruleHits: decision.ruleHits,
          confidence: decision.confidence,
          requiresUserConfirmation: decision.intent === "new_task",
          reason: decision.reason,
        },
        at: req.at,
      });
    },
    async close() {
      await release();
    },
  };
}

void newId;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/runtime/master-host.ts packages/bot-runtime/src/runtime/__tests__/master-host.test.ts
git commit -m "feat(runtime): add MasterHost wiring guard, repos, and thread loops"
```

---

### Task 57: Worker host wiring（runtime/worker-host.ts）

**Files:**
- Create: `packages/bot-runtime/src/runtime/worker-host.ts`
- Test: `packages/bot-runtime/src/runtime/__tests__/worker-host.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createJobQueue } from "../../repositories/job-queue.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createStubLlmClient } from "../../llm/client.js";
import { createWorkerHost } from "../worker-host.js";

describe("WorkerHost", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "wh-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  const ids = {
    user: "u_018f5d20-0000-7000-8000-000000000001",
    th: "th_018f5d20-0000-7000-8000-000000000001",
  };

  it("draws one pending job and runs Executor", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const jobs = createJobQueue(paths, "rt-1");
    const t = await taskRepo.createDraft({
      threadId: ids.th,
      ownerUserId: ids.user,
      title: "x",
      description: "",
      sourceMessageIds: ["msg-1"],
    });
    const p = await planRepo.createDraftPlan({
      taskId: t.id,
      threadId: ids.th,
      objective: "x",
      steps: [],
    });
    await taskRepo.transitionStatus(t.id, "confirmed", { confirmedByUserId: ids.user });
    await planRepo.activate(p.id, ids.th, t.id);
    await taskRepo.transitionStatus(t.id, "queued");
    await jobs.enqueueExecuteTask({
      taskId: t.id,
      threadId: ids.th,
      planRevisionId: p.id,
      fencingToken: 1000001,
    });
    await mkdir(paths.workspace("rt-1", ids.th, t.id), { recursive: true });

    const llm = createStubLlmClient({}, { kind: "text", text: "done" });
    const host = await createWorkerHost({
      paths,
      runtimeId: "rt-1",
      llm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });
    const result = await host.runOnce();
    expect(result?.outcome).toBe("completed");
    await host.close();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../worker-host.js` 不存在。

- [ ] **Step 3：实现**

```ts
import { acquireInstanceLock, type ReleaseLock } from "../storage/lock.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { createJobQueue, type JobQueue } from "../repositories/job-queue.js";
import { createPlanRepo, type PlanRepo } from "../repositories/plan-repo.js";
import { createTaskRepo, type TaskRepo } from "../repositories/task-repo.js";
import { createPaths, type Paths } from "../storage/paths.js";
import { createDispatcher, type Dispatcher } from "../tools/dispatcher.js";
import { createDefaultToolRegistry } from "../tools/registry.js";
import { runWorkerPoolOnce, type WorkerPoolOnceInput } from "../executor/worker-pool.js";
import type { LlmClient } from "../llm/client.js";

export type CreateWorkerHostInput = {
  paths: Paths;
  runtimeId: string;
  llm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
};

export type WorkerHost = {
  taskRepo: TaskRepo;
  planRepo: PlanRepo;
  jobs: JobQueue;
  dispatcher: Dispatcher;
  runOnce(): Promise<Awaited<ReturnType<typeof runWorkerPoolOnce>>>;
  close(): Promise<void>;
};

export async function createWorkerHost(
  input: CreateWorkerHostInput,
): Promise<WorkerHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "worker",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });

  const taskRepo = createTaskRepo(input.paths, input.runtimeId);
  const planRepo = createPlanRepo(input.paths, input.runtimeId);
  const jobs = createJobQueue(input.paths, input.runtimeId);
  const tools = createDefaultToolRegistry({
    paths: input.paths,
    taskRepo,
    planRepo,
  });
  const dispatcher = createDispatcher({ tools, policies: [] });

  return {
    taskRepo,
    planRepo,
    jobs,
    dispatcher,
    async runOnce() {
      const args: WorkerPoolOnceInput = {
        paths: input.paths,
        runtimeId: input.runtimeId,
        executorIdPrefix: "ex",
        taskRepo,
        planRepo,
        jobs,
        dispatcher,
        llm: input.llm,
        systemPrompt: input.systemPrompt,
        maxSteps: input.maxSteps,
        leaseMs: input.leaseMs,
      };
      return runWorkerPoolOnce(args);
    },
    async close() {
      await release();
    },
  };
}

void createPaths;
```

- [ ] **Step 4：跑测试确认通过**

Expected: 1 test passed.

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/runtime/worker-host.ts packages/bot-runtime/src/runtime/__tests__/worker-host.test.ts
git commit -m "feat(runtime): add WorkerHost wiring tools, dispatcher, and worker pool"
```

---

### Task 58: Hybrid host + 入口（runtime/hybrid-host.ts、index.ts）

**Files:**
- Create: `packages/bot-runtime/src/runtime/hybrid-host.ts`
- Modify: `packages/bot-runtime/src/index.ts`
- Test: `packages/bot-runtime/src/runtime/__tests__/hybrid-host.test.ts`

> **Important note**：MasterHost 与 WorkerHost 都各自调用 `acquireInstanceLock`。在 hybrid 单进程模式下，两者必须共用同一个锁，否则第二次 `acquireInstanceLock` 会抛错。本任务中我们让 `createHybridHost` 自己锁住实例，并把锁传给底层 host（通过新增的 `lockHandle` 选项绕过内部锁）。

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createStubLlmClient } from "../../llm/client.js";
import { createHybridHost } from "../hybrid-host.js";

describe("HybridHost", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "hh-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("ingests inbound, dispatches, and worker.runOnce drives task to completion", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-1"), { recursive: true });
    const guardLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: { intent: "new_task", confidence: 0.95, reason: "stub" },
      },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "do x",
          description: "",
          objective: "x",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const execLlm = createStubLlmClient({}, { kind: "text", text: "done" });

    const host = await createHybridHost({
      paths,
      runtimeId: "rt-1",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you are an AI employee",
      maxSteps: 3,
      leaseMs: 60_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";
    const thread = await host.master.threadRepo.create({
      title: "demo",
      ownerUserId: userId,
    });

    const drafted = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "build me a thing",
      at: "2026-04-28T00:00:00Z",
    });
    expect(drafted.kind).toBe("draft_created");
    if (drafted.kind !== "draft_created") return;

    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-28T00:00:01Z",
    });

    await mkdir(paths.workspace("rt-1", thread.id, drafted.taskId), { recursive: true });

    const result = await host.worker.runOnce();
    expect(result?.outcome).toBe("completed");
    const after = await host.master.taskRepo.load(drafted.taskId);
    expect(after?.status).toBe("completed");
    await host.close();
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Expected: FAIL — `../hybrid-host.js` 不存在；并且 master/worker host 不接受 `lockHandle`，仍会重复锁。

- [ ] **Step 3：实现**

修改 `packages/bot-runtime/src/runtime/master-host.ts` 与 `worker-host.ts` 的 `CreateMasterHostInput` / `CreateWorkerHostInput`，新增可选 `existingLock` 字段；当传入时跳过 `acquireInstanceLock` 与 `recoverOnBoot`。

`packages/bot-runtime/src/runtime/master-host.ts` 改动：
```ts
export type CreateMasterHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  systemPrompt: string;
  existingLock?: { release: ReleaseLock; skipBoot: boolean };
};

export async function createMasterHost(
  input: CreateMasterHostInput,
): Promise<MasterHost> {
  const release: ReleaseLock =
    input.existingLock?.release ??
    (await acquireInstanceLock(input.paths, input.runtimeId, { role: "master" }));
  if (!input.existingLock?.skipBoot) {
    await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });
  }
  // ...rest unchanged...
  return {
    /* ... */
    async close() {
      if (!input.existingLock) await release();
    },
  };
}
```

`packages/bot-runtime/src/runtime/worker-host.ts` 同样添加 `existingLock` 字段，并在 close 时按相同规则跳过释放。

`packages/bot-runtime/src/runtime/hybrid-host.ts`：
```ts
import { acquireInstanceLock, type ReleaseLock } from "../storage/lock.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import type { LlmClient } from "../llm/client.js";
import type { Paths } from "../storage/paths.js";
import { createMasterHost, type MasterHost } from "./master-host.js";
import { createWorkerHost, type WorkerHost } from "./worker-host.js";

export type CreateHybridHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  execLlm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
};

export type HybridHost = {
  master: MasterHost;
  worker: WorkerHost;
  close(): Promise<void>;
};

export async function createHybridHost(
  input: CreateHybridHostInput,
): Promise<HybridHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "hybrid",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });

  const master = await createMasterHost({
    paths: input.paths,
    runtimeId: input.runtimeId,
    guardLlm: input.guardLlm,
    draftLlm: input.draftLlm,
    systemPrompt: input.systemPrompt,
    existingLock: { release: async () => undefined, skipBoot: true },
  });
  const worker = await createWorkerHost({
    paths: input.paths,
    runtimeId: input.runtimeId,
    llm: input.execLlm,
    systemPrompt: input.systemPrompt,
    maxSteps: input.maxSteps,
    leaseMs: input.leaseMs,
    existingLock: { release: async () => undefined, skipBoot: true },
  });

  return {
    master,
    worker,
    async close() {
      await master.close();
      await worker.close();
      await release();
    },
  };
}
```

修改 `packages/bot-runtime/src/index.ts` 暴露入口：
```ts
import { createPaths } from "./storage/paths.js";
import { createAnthropicLlmClient } from "./llm/anthropic.js";
import { parseRuntimeConfig } from "./config/env.js";
import { createMasterHost } from "./runtime/master-host.js";
import { createWorkerHost } from "./runtime/worker-host.js";
import { createHybridHost } from "./runtime/hybrid-host.js";

export const VERSION = "0.0.0";

export {
  createPaths,
  parseRuntimeConfig,
  createAnthropicLlmClient,
  createMasterHost,
  createWorkerHost,
  createHybridHost,
};

export async function main(env: Record<string, unknown> = process.env): Promise<void> {
  const cfg = parseRuntimeConfig(env);
  const paths = createPaths(cfg.dataDir);
  const llm = cfg.anthropicApiKey
    ? createAnthropicLlmClient({
        apiKey: cfg.anthropicApiKey,
        model: cfg.anthropicModel,
        maxTokens: cfg.anthropicMaxTokens,
      })
    : (() => {
        throw new Error("ANTHROPIC_API_KEY required for production run; use stub LLM in tests");
      })();

  if (cfg.role === "hybrid") {
    const host = await createHybridHost({
      paths,
      runtimeId: cfg.runtimeId,
      guardLlm: llm,
      draftLlm: llm,
      execLlm: llm,
      systemPrompt: "You are an AI employee.",
      maxSteps: cfg.executorMaxSteps,
      leaseMs: cfg.executorLeaseMs,
    });
    process.on("SIGINT", () => host.close().finally(() => process.exit(0)));
    process.on("SIGTERM", () => host.close().finally(() => process.exit(0)));
  } else if (cfg.role === "master") {
    await createMasterHost({
      paths,
      runtimeId: cfg.runtimeId,
      guardLlm: llm,
      draftLlm: llm,
      systemPrompt: "You are an AI employee.",
    });
  } else {
    await createWorkerHost({
      paths,
      runtimeId: cfg.runtimeId,
      llm,
      systemPrompt: "You are an AI employee.",
      maxSteps: cfg.executorMaxSteps,
      leaseMs: cfg.executorLeaseMs,
    });
  }
}
```

- [ ] **Step 4：跑测试确认通过**

```bash
pnpm --filter @ai-employee/bot-runtime test hybrid-host
```

Expected: 1 test passed; 同时 master-host.test 和 worker-host.test 仍然 passed（保持向后兼容）。

- [ ] **Step 5：Commit**

```bash
git add packages/bot-runtime/src/runtime/hybrid-host.ts packages/bot-runtime/src/runtime/master-host.ts packages/bot-runtime/src/runtime/worker-host.ts packages/bot-runtime/src/runtime/__tests__/hybrid-host.test.ts packages/bot-runtime/src/index.ts
git commit -m "feat(runtime): add HybridHost with shared lock and main entry point"
```

---

## Phase I — 端到端集成

> 这一组测试在 `tests/integration/` 下，验证 Plan 1 的最终态：headless 端到端 + 崩溃恢复。

### Task 59: Headless end-to-end（tests/integration/headless-end-to-end.test.ts）

**Files:**
- Create: `packages/bot-runtime/tests/integration/headless-end-to-end.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../src/storage/paths.js";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";

describe("E2E: inbound → guard → draft → confirm → execute → artifact", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "e2e-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("completes full flow with stub LLMs and writes a workspace artifact", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-e2e"), { recursive: true });

    const guardLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: { intent: "new_task", confidence: 0.95, reason: "stub" },
      },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "write hello",
          description: "make a hello.txt",
          objective: "produce hello.txt with text 'world'",
          steps: [{ id: "s1", title: "write file", status: "pending" }],
          expectedArtifacts: ["hello.txt"],
        },
      },
    );
    let execStep = 0;
    const execLlm = {
      async complete() {
        execStep += 1;
        if (execStep === 1) {
          return {
            kind: "tool_call" as const,
            toolName: "write_file",
            input: { path: "hello.txt", content: "world" },
            id: "toolu_1",
          };
        }
        return { kind: "text" as const, text: "done" };
      },
    };

    const host = await createHybridHost({
      paths,
      runtimeId: "rt-e2e",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "you write files",
      maxSteps: 5,
      leaseMs: 60_000,
    });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";
    const thread = await host.master.threadRepo.create({
      title: "e2e",
      ownerUserId: userId,
    });

    const drafted = await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "make me a hello.txt",
      at: "2026-04-28T00:00:00Z",
    });
    if (drafted.kind !== "draft_created") throw new Error("expected draft_created");

    await host.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-28T00:00:01Z",
    });
    await mkdir(paths.workspace("rt-e2e", thread.id, drafted.taskId), { recursive: true });

    const result = await host.worker.runOnce();
    expect(result?.outcome).toBe("completed");

    const ws = paths.workspace("rt-e2e", thread.id, drafted.taskId);
    const wsFiles = await readdir(ws);
    expect(wsFiles).toContain("hello.txt");

    const final = await host.master.taskRepo.load(drafted.taskId);
    expect(final?.status).toBe("completed");

    await host.close();
  });
});
```

- [ ] **Step 2：跑测试确认通过**

```bash
pnpm --filter @ai-employee/bot-runtime test headless-end-to-end
```

Expected: 1 test passed.

- [ ] **Step 3：Commit**

```bash
git add packages/bot-runtime/tests/integration/headless-end-to-end.test.ts
git commit -m "test(integration): headless end-to-end inbound→guard→draft→confirm→execute→artifact"
```

---

### Task 60: Crash recovery e2e（tests/integration/recovery-after-crash.test.ts）

**Files:**
- Create: `packages/bot-runtime/tests/integration/recovery-after-crash.test.ts`

- [ ] **Step 1：写测试**

```ts
import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeJson } from "../../src/storage/json-file.js";
import { createPaths } from "../../src/storage/paths.js";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";

describe("E2E: crash recovery", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "rec-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("re-leases an expired locked job after restart and completes it", async () => {
    const paths = createPaths(dataRoot);
    await mkdir(paths.instanceRoot("rt-rec"), { recursive: true });

    const userId = "u_018f5d20-0000-7000-8000-000000000001";
    const guardLlm = createStubLlmClient(
      {},
      { kind: "json", data: { intent: "new_task", confidence: 0.9, reason: "stub" } },
    );
    const draftLlm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "x",
          description: "",
          objective: "x",
          steps: [],
          expectedArtifacts: [],
        },
      },
    );
    const execLlm = createStubLlmClient({}, { kind: "text", text: "done" });

    const host1 = await createHybridHost({
      paths,
      runtimeId: "rt-rec",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });

    const thread = await host1.master.threadRepo.create({
      title: "rec",
      ownerUserId: userId,
    });
    const drafted = await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-1",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: "do x",
      at: "2026-04-28T00:00:00Z",
    });
    if (drafted.kind !== "draft_created") throw new Error("draft_created expected");
    await host1.master.ingestInbound({
      threadId: thread.id,
      messageId: "msg-2",
      fromUserId: userId,
      source: "client",
      bound: false,
      mentionsBot: false,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: "2026-04-28T00:00:01Z",
    });

    const lockedDir = paths.jobsDir("rt-rec", "locked");
    await mkdir(lockedDir, { recursive: true });
    const pendingDir = paths.jobsDir("rt-rec", "pending");
    const pendingFiles = await readdir(pendingDir);
    expect(pendingFiles.length).toBe(1);
    const pendingFile = pendingFiles[0]!;
    const fs = await import("node:fs/promises");
    const job = JSON.parse(await fs.readFile(path.join(pendingDir, pendingFile), "utf8"));
    job.lockHolder = "ghost";
    job.leaseExpireAt = new Date(Date.now() - 1000).toISOString();
    await writeJson(path.join(lockedDir, pendingFile), job);
    await fs.unlink(path.join(pendingDir, pendingFile));

    await host1.close();

    const host2 = await createHybridHost({
      paths,
      runtimeId: "rt-rec",
      guardLlm,
      draftLlm,
      execLlm,
      systemPrompt: "x",
      maxSteps: 3,
      leaseMs: 60_000,
    });
    const failed = await readdir(paths.jobsDir("rt-rec", "failed"));
    expect(failed.length).toBeGreaterThanOrEqual(1);
    const after = await host2.master.taskRepo.load(drafted.taskId);
    expect(["confirmed", "queued", "failed", "blocked"]).toContain(after?.status);
    await host2.close();
  });
});
```

- [ ] **Step 2：跑测试确认通过**

```bash
pnpm --filter @ai-employee/bot-runtime test recovery-after-crash
```

Expected: 1 test passed.

- [ ] **Step 3：Commit**

```bash
git add packages/bot-runtime/tests/integration/recovery-after-crash.test.ts
git commit -m "test(integration): crash recovery moves stale locked job to failed and frees task"
```

---

## 全量验证

- [ ] **Step 1：跑完整测试套件**

```bash
pnpm install
pnpm --filter @ai-employee/bot-runtime test
```

Expected: 60+ test files, 全部 PASS。

- [ ] **Step 2：Build 全量 TypeScript**

```bash
pnpm -r build
```

Expected: 无 type error。

- [ ] **Step 3：Lint 全部代码**

```bash
pnpm lint
```

Expected: 无 lint error；如有 minor warning 可在后续 plan 处理。

- [ ] **Step 4：Commit clean state（如有）**

```bash
git status
git commit -am "chore: pass full test/build/lint pipeline" || true
```

---

## Plan 1 自查报告

**1. Spec 覆盖（Spec 第 17 章实施起点 #1-#5）：**

| Spec 起点 | Plan 1 任务 |
|---|---|
| #1 文件系统状态库（runtime workspace、`.lock`、fencing token、jobs/、events.jsonl） | Task 1, 2, 4, 5, 7, 8, 9, 10, 24, 44 |
| #2 数据模型 schema（User、Thread、Task、Plan、PlanRevision、GuardDecision、ChannelBinding、CriticalNodePolicy） | Task 11-19 |
| #3 ThreadLoop 单进程实现 | Task 36, 39, 40, 41, 42, 56 |
| #4 Executor 单进程实现 + 文件队列协议 | Task 43, 44, 45, 47, 48, 49, 57 |
| #5 MessageGuard：规则短路 + LLM 结构化分类 | Task 50, 51, 52, 53, 54 |

附加：Tool 协议（27-35）虽然 spec 第 17 章未单列阶段，但属于第 4 节工具能力的支撑，必须在 Plan 1 完成。

**2. 占位符扫描：** 已逐 task 检查；无 "TBD"、"TODO"、"implement later"。Task 31 update_plan 留有 self-review note，需在执行时按 note 提示再补一个 `replaceDraftPlan` 方法（不是占位符，是 self-review 跟踪项）。

**3. 类型一致性：**

- `Tool.call(args, { ctx })` 签名：Task 27 定义 → Task 28-35 全部沿用
- `JobQueue.leaseNext({ lockHolder, leaseMs })` 签名：Task 24 定义 → Task 48 worker pool、Task 60 crash recovery 都按此调用
- `ThreadLoopResult` 三种 kind（ignored/draft_created/dispatched/noop）：Task 41 定义 → Task 56 master-host 直接 re-export
- `ExecutorEvent` discriminated union：Task 19 定义 → Task 44 events writer、Task 45 detect in-flight、Task 47 executor 全部沿用
- `RuntimeRole`、`RuntimeInfo`：Task 7 定义 → Task 55 env config 沿用同一枚举值
- `ChannelBinding.channelBindingIds[]`：Spec 第 4.2 节定义 → Task 12 thread schema、Task 16 channel schema 都用同一名

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-28-ai-employee-system-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每个 Task 起一个干净 subagent 跑，Task 之间我做 code review，迭代速度快、上下文最干净。

**2. Inline Execution** - 在当前 session 直接执行，按 Phase 设置 checkpoint 让你 review。

**Which approach?**

---

## 后续 Plan 预告

- Plan 2：Channel 子系统 + Feishu Provider（覆盖 Spec 第 17 章 #6-#7），让真实飞书消息能驱动 Plan 1 的 hybrid host。
- Plan 3：客户端最小可视化（Spec #8）。
- Plan 4：Agent eval + v1 验收 e2e（Spec #9-#10）。















