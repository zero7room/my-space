# Client Visualization Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 Plan 1 + Plan 2 的 headless runtime 装上"沟通和可视化"客户端：HTTP read API + SSE 事件流 + 极简 React 前端，覆盖 Spec 第 10 章和第 17 章 #8 列出的最小可视化需求。

**Architecture:**
- 后端：在 bot-runtime 包内沿用 Plan 2 的 `IngressServer` 增加 `/api/...` 路由族，由 HybridHost 的 admin token 鉴权（v1 不做单独的 client auth），SSE 端点直接 tail `events.jsonl + thread 级别内存广播`。
- 前端：`apps/web` 新包，**Vite + React 18 + TypeScript**，单页应用 + 客户端路由（react-router）。**不引入 UI 库**（shadcn/MUI/AntD 都不上），用纯 CSS module；目标是 v1 能跑通，看清状态而不是好看。
- 数据流：前端通过 `EventSource` 订阅 `/api/threads/:id/events?cursor=...`；写操作（confirm/cancel/post message）走普通 `fetch`。
- secrets：与 Plan 2 一致，前端只看 `hasSecret: bool`。

**Tech Stack:**
- 后端：Plan 1+2 已有的 Node 20 / TypeScript 5.6 / Vitest 2 / Zod 3 / `node:http` ingress。
- 前端：Vite 5、React 18、react-router 6、TypeScript 5.6、Vitest 2（可选 jsdom），无 UI 库。
- 测试：后端 Vitest 单元 + 集成；前端 Vitest + React Testing Library（仅 hook + 关键组件，UI 不强制覆盖）。

**Spec 起点覆盖：** 第 17 章 #8（客户端最小可视化），第 8 章（流式协议），第 10 章（客户端需求清单）。

**前置依赖（Plan 1+2 提供）：**
- `IngressServer` + `mountAdminApi`（Plan 2 Task 6, 29）
- `MasterHost` 提供 `threadRepo / taskRepo / planRepo / transcript / guardRepo / ingestInbound`
- `HybridHost` 已暴露 `ingressPort`、`channelStore`、`providerRegistry`（Plan 2 Task 30）
- 文件系统结构：`state/threads/<id>/{thread.json, transcript.jsonl, tasks/<tk>/{task.json, plan.json, events.jsonl}}`（Plan 1 第 4-5 章）

**Plan 1 follow-up 一并清掉（Phase E）：**
- #19 `paths.ts channelType: string` → `Provider` union
- #20 `paths.ts` 全方法参数化覆盖测试
- #21 `update-plan` 工具的直写路径集成测试
- #22 `critical-node` 5 种 matcher 全覆盖测试

---

## Phase A — 后端只读 API（8 tasks）

### Task 1: Thread API（list / get）

**Files:**
- Create: `packages/bot-runtime/src/api/thread-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/thread-api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/thread-api.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountThreadApi } from "../thread-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ta-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Thread API", () => {
  it("GET /api/threads lists all threads with summary fields", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const t1 = await repo.create({ ownerUserId, title: "Project A" });
    const t2 = await repo.create({ ownerUserId, title: "Project B" });

    mountThreadApi(server, { threadRepo: repo, adminToken: "a" });
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/api/threads`, {
      headers: { "x-admin-token": "a" },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; title: string }>;
    const ids = list.map((t) => t.id).sort();
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
  });

  it("GET /api/threads/:id returns thread detail or 404", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const t = await repo.create({ ownerUserId, title: "Single" });
    mountThreadApi(server, { threadRepo: repo, adminToken: "a" });
    const { port } = await server.listen(0);
    const ok = await fetch(`http://127.0.0.1:${port}/api/threads/${t.id}`, {
      headers: { "x-admin-token": "a" },
    });
    expect(ok.status).toBe(200);
    const detail = (await ok.json()) as { id: string; title: string };
    expect(detail.title).toBe("Single");

    const miss = await fetch(`http://127.0.0.1:${port}/api/threads/th_missing`, {
      headers: { "x-admin-token": "a" },
    });
    expect(miss.status).toBe(404);
  });

  it("GET /api/threads returns 401 without admin token", async () => {
    mountThreadApi(server, {
      threadRepo: createThreadRepo(createPaths(tmp), runtimeId),
      adminToken: "a",
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads`);
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- thread-api`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 实现 thread-api.ts**

```ts
// packages/bot-runtime/src/api/thread-api.ts
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import type { IngressServer } from "../ingress/http-server.js";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { Paths } from "../storage/paths.js";

export type ThreadApiOptions = {
  threadRepo: ThreadRepo;
  adminToken: string;
  paths?: Paths;
  runtimeId?: string;
};

function checkAdmin(headers: Record<string, string | string[] | undefined>, expected: string) {
  const got = headers["x-admin-token"];
  const value = Array.isArray(got) ? got[0] : got;
  return value === expected;
}

export function mountThreadApi(server: IngressServer, opts: ThreadApiOptions): void {
  server.route("GET", "/api/threads", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    if (!opts.paths || !opts.runtimeId) {
      return { status: 200, body: [] };
    }
    const dir = path.posix.join(opts.paths.state(opts.runtimeId), "threads");
    await mkdir(dir, { recursive: true });
    const ids = (await readdir(dir)).filter((d) => d.startsWith("th_"));
    const out: unknown[] = [];
    for (const id of ids) {
      const t = await opts.threadRepo.load(id);
      if (t) out.push(t);
    }
    return { status: 200, body: out };
  });

  // Match GET /api/threads/<threadId> with prefix matching
  // The IngressServer matches exact paths; we register a fallback handler via a wildcard-ish convention
  // by using a specific route per thread is impractical. Instead expose a lookup-by-id on a known prefix.
  // For v1 we register /api/threads/lookup pulled from query string.
  server.route("GET", "/api/threads/lookup", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const url = new URL(req.url, "http://x");
    const id = url.searchParams.get("id");
    if (!id) return { status: 400, body: { error: "id required" } };
    const t = await opts.threadRepo.load(id);
    if (!t) return { status: 404, body: { error: "not found" } };
    return { status: 200, body: t };
  });
}
```

**注意：** `IngressServer` 当前只支持精确路径匹配（Plan 2 Task 6），不支持参数化 `/api/threads/:id`。这一 task 通过 query string `?id=<th>` 暂代；Task 2 会引入参数化路由扩展 `IngressServer`。这里先用 query 形式让测试过。

**修改测试以匹配实现：** 把 `GET /api/threads/${t.id}` 改成 `GET /api/threads/lookup?id=${t.id}`，把 `th_missing` 改成 `lookup?id=th_missing`。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- thread-api
git add packages/bot-runtime/src/api
git commit -m "feat(api): thread list and lookup endpoints (admin-token gated)"
```

Expected: 3 tests PASS。

---

### Task 2: 扩展 IngressServer 支持参数化路由 `:param`

**Files:**
- Modify: `packages/bot-runtime/src/ingress/http-server.ts`
- Modify: `packages/bot-runtime/src/ingress/__tests__/http-server.test.ts`

**目的：** 后续 task 大量需要 `/api/threads/:id/...` 形态。一次性把路由层升级，handler 收到 `req.params`。

- [ ] **Step 1: 增加测试用例（追加到现有测试文件）**

```ts
// packages/bot-runtime/src/ingress/__tests__/http-server.test.ts (append)
it("matches parameterized routes and exposes params to handler", async () => {
  server = createIngressServer();
  let captured: Record<string, string> | null = null;
  server.route("GET", "/api/threads/:id/tasks", async (req) => {
    captured = req.params;
    return { status: 200, body: { id: req.params.id } };
  });
  const { port } = await server.listen(0);
  const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/tasks`);
  expect(r.status).toBe(200);
  const body = (await r.json()) as { id: string };
  expect(body.id).toBe("th_x");
  expect(captured).toEqual({ id: "th_x" });
});

it("prefers exact match over parameterized when both registered", async () => {
  server = createIngressServer();
  server.route("GET", "/api/threads/:id", async () => ({ status: 200, body: "param" }));
  server.route("GET", "/api/threads/list", async () => ({ status: 200, body: "exact" }));
  const { port } = await server.listen(0);
  const r = await fetch(`http://127.0.0.1:${port}/api/threads/list`);
  expect(await r.text()).toBe("exact");
});
```

- [ ] **Step 2: 跑测试确认失败**

Expected: FAIL（params 字段不存在 / 通配匹配不工作）。

- [ ] **Step 3: 修改 http-server.ts**

把 `routes: Map<string, IngressHandler>` 拆成 exact map + 数组形式的 pattern routes：

```ts
// 关键改动
type Route = {
  method: string;
  segments: string[];      // ["api", "threads", ":id", "tasks"]
  paramIdx: number[];      // [2]
  handler: IngressHandler;
};

const routes: Route[] = [];

function compile(pathPattern: string): { segments: string[]; paramIdx: number[] } {
  const segments = pathPattern.split("/").filter((s) => s.length > 0);
  const paramIdx: number[] = [];
  segments.forEach((s, i) => {
    if (s.startsWith(":")) paramIdx.push(i);
  });
  return { segments, paramIdx };
}

function match(method: string, pathname: string): { handler: IngressHandler; params: Record<string, string> } | null {
  const reqSegs = pathname.split("/").filter((s) => s.length > 0);
  for (const r of routes) {
    if (r.method.toUpperCase() !== method.toUpperCase()) continue;
    if (r.segments.length !== reqSegs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < r.segments.length; i++) {
      const seg = r.segments[i]!;
      const got = reqSegs[i]!;
      if (seg.startsWith(":")) {
        params[seg.slice(1)] = got;
      } else if (seg !== got) {
        ok = false;
        break;
      }
    }
    if (ok) return { handler: r.handler, params };
  }
  return null;
}
```

排序：注册时 exact 优先于 param。最简单：注册时把 `:` 段更多的放到末尾。或在 `match()` 里两轮：先过纯 exact，再过含 param 的。

`IngressRequest` 加 `params: Record<string, string>` 字段。

`route(method, path, handler)` 改为 `routes.push({ method, segments, paramIdx, handler })`。

- [ ] **Step 4: 重写之前测试中失败行**

Task 1 的 `lookup?id=` 形式要改回 `/api/threads/:id`。打开 `thread-api.ts`，把第二个路由从 `/api/threads/lookup` 改为：

```ts
server.route("GET", "/api/threads/:id", async (req) => {
  if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
  const id = req.params.id ?? "";
  const t = await opts.threadRepo.load(id);
  if (!t) return { status: 404, body: { error: "not found" } };
  return { status: 200, body: t });
});
```

`thread-api.test.ts` 测试也改回 `/api/threads/${t.id}`。

- [ ] **Step 5: 跑全部测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test
git add packages/bot-runtime/src/ingress packages/bot-runtime/src/api
git commit -m "feat(ingress): parameterized routes with req.params"
```

Expected: 全部 PASS。

---

### Task 3: Task API（list / get）

**Files:**
- Create: `packages/bot-runtime/src/api/task-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/task-api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/task-api.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountTaskApi } from "../task-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "tk-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Task API", () => {
  it("GET /api/threads/:id/tasks lists tasks for thread", async () => {
    const paths = createPaths(tmp);
    const threadRepo = createThreadRepo(paths, runtimeId);
    const taskRepo = createTaskRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const thread = await threadRepo.create({ ownerUserId, title: "T" });
    const t1 = await taskRepo.createDraft({
      threadId: thread.id,
      ownerUserId,
      title: "Task 1",
      description: "d",
      sourceMessageIds: [],
    });

    mountTaskApi(server, { taskRepo, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/${thread.id}/tasks`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const list = (await r.json()) as Array<{ id: string }>;
    expect(list.map((t) => t.id)).toContain(t1.id);
  });

  it("GET /api/tasks/:id returns task detail", async () => {
    const paths = createPaths(tmp);
    const threadRepo = createThreadRepo(paths, runtimeId);
    const taskRepo = createTaskRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const thread = await threadRepo.create({ ownerUserId, title: "T" });
    const task = await taskRepo.createDraft({
      threadId: thread.id,
      ownerUserId,
      title: "Detail",
      description: "d",
      sourceMessageIds: [],
    });
    mountTaskApi(server, { taskRepo, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/${task.id}`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const detail = (await r.json()) as { title: string };
    expect(detail.title).toBe("Detail");
  });
});
```

注：`createDraft` 是 Plan 1 task-repo 的实际方法名 —— 检查 `packages/bot-runtime/src/repositories/task-repo.ts` 确认；如果不同，按实际签名调整测试中创建任务的部分。

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 task-api.ts**

```ts
// packages/bot-runtime/src/api/task-api.ts
import type { IngressServer } from "../ingress/http-server.js";
import type { TaskRepo } from "../repositories/task-repo.js";

export type TaskApiOptions = {
  taskRepo: TaskRepo;
  adminToken: string;
};

function checkAdmin(headers: Record<string, string | string[] | undefined>, expected: string) {
  const got = headers["x-admin-token"];
  const value = Array.isArray(got) ? got[0] : got;
  return value === expected;
}

export function mountTaskApi(server: IngressServer, opts: TaskApiOptions): void {
  server.route("GET", "/api/threads/:id/tasks", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const threadId = req.params.id ?? "";
    const list = await opts.taskRepo.listForThread(threadId);
    return { status: 200, body: list };
  });
  server.route("GET", "/api/tasks/:id", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const id = req.params.id ?? "";
    const t = await opts.taskRepo.load(id);
    if (!t) return { status: 404, body: { error: "not found" } };
    return { status: 200, body: t };
  });
}
```

如果 `taskRepo.listForThread` 不存在，需要先在 `task-repo.ts` 加一个（读 `state/threads/<th>/tasks/` 目录）。先查 task-repo.ts 现状再决定是否需要扩展。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- task-api
git add packages/bot-runtime/src
git commit -m "feat(api): task list and detail endpoints"
```

Expected: 2 tests PASS。

---

### Task 4: Plan API（current revision + history）

**Files:**
- Create: `packages/bot-runtime/src/api/plan-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/plan-api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/plan-api.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountPlanApi } from "../plan-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "pa-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Plan API", () => {
  it("GET /api/tasks/:id/plan returns the active plan or 404", async () => {
    const paths = createPaths(tmp);
    const planRepo = createPlanRepo(paths, runtimeId);
    const taskId = newId("tk");
    const threadId = newId("th");
    const created = await planRepo.createDraft({
      taskId,
      threadId,
      objective: "ship",
      steps: [{ id: newId("ps"), title: "step 1", status: "pending" }],
      expectedArtifacts: [],
    });
    mountPlanApi(server, { planRepo, adminToken: "a" });
    const { port } = await server.listen(0);

    const ok = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/plan`, {
      headers: { "x-admin-token": "a" },
    });
    expect(ok.status).toBe(200);
    const detail = (await ok.json()) as { id: string; objective: string };
    expect(detail.id).toBe(created.id);
    expect(detail.objective).toBe("ship");

    const miss = await fetch(`http://127.0.0.1:${port}/api/tasks/tk_missing/plan`, {
      headers: { "x-admin-token": "a" },
    });
    expect(miss.status).toBe(404);
  });

  it("GET /api/plans/:id/revisions lists archived revisions", async () => {
    const paths = createPaths(tmp);
    const planRepo = createPlanRepo(paths, runtimeId);
    const taskId = newId("tk");
    const threadId = newId("th");
    const plan = await planRepo.createDraft({
      taskId,
      threadId,
      objective: "v0",
      steps: [],
      expectedArtifacts: [],
    });
    mountPlanApi(server, { planRepo, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/plans/${plan.id}/revisions`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const list = (await r.json()) as Array<unknown>;
    expect(Array.isArray(list)).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 plan-api.ts**

按 task-api.ts 模板实现：
- `GET /api/tasks/:id/plan` → `planRepo.loadActiveForTask(taskId)`
- `GET /api/plans/:id/revisions` → `planRepo.listRevisions(planId)`

如果 `loadActiveForTask` 或 `listRevisions` 不存在，先扩展 `plan-repo.ts`。Plan 1 大概率有按 taskId 找 plan 的 helper（基于 `state/threads/<th>/tasks/<tk>/plan.json` 文件）。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- plan-api
git add packages/bot-runtime/src
git commit -m "feat(api): plan and plan-revisions endpoints"
```

Expected: 2 tests PASS。

---

### Task 5: Artifact API（list outputs/）

**Files:**
- Create: `packages/bot-runtime/src/api/artifact-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/artifact-api.test.ts`

**说明：** v1 artifact = `state/threads/<th>/tasks/<tk>/user-data/outputs/` 下的文件树（不含 `_archive/`）。返回 `[ { name, sizeBytes, modifiedAt } ]`。后续支持下载内容。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/artifact-api.test.ts
import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountArtifactApi } from "../artifact-api.js";

let tmp: string;
let server: IngressServer;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "art-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Artifact API", () => {
  it("GET /api/tasks/:id/artifacts lists files under outputs/", async () => {
    const paths = createPaths(tmp);
    const runtimeId = "rt_test";
    const threadId = "th_x";
    const taskId = "tk_y";
    const outputs = path.posix.join(
      paths.state(runtimeId),
      "threads",
      threadId,
      "tasks",
      taskId,
      "user-data",
      "outputs",
    );
    await mkdir(outputs, { recursive: true });
    await writeFile(path.posix.join(outputs, "a.txt"), "hello");

    mountArtifactApi(server, { paths, runtimeId, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/artifacts?threadId=${threadId}`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const list = (await r.json()) as Array<{ name: string; sizeBytes: number }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("a.txt");
    expect(list[0]?.sizeBytes).toBe(5);
  });

  it("GET /api/tasks/:id/artifacts/:filename returns file contents", async () => {
    const paths = createPaths(tmp);
    const runtimeId = "rt_test";
    const threadId = "th_x";
    const taskId = "tk_y";
    const outputs = path.posix.join(
      paths.state(runtimeId),
      "threads",
      threadId,
      "tasks",
      taskId,
      "user-data",
      "outputs",
    );
    await mkdir(outputs, { recursive: true });
    await writeFile(path.posix.join(outputs, "report.md"), "# title");
    mountArtifactApi(server, { paths, runtimeId, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(
      `http://127.0.0.1:${port}/api/tasks/${taskId}/artifacts/report.md?threadId=${threadId}`,
      { headers: { "x-admin-token": "a" } },
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("# title");
  });
});
```

注：URL 把 threadId 放进 query 是因为 artifact 文件路径需要 thread+task 复合定位（Plan 1 paths 设计）。生产中可先按 task → thread 反查（taskRepo.load(taskId).threadId）替换 query string，但 v1 简化为 query。

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 artifact-api.ts**

```ts
// packages/bot-runtime/src/api/artifact-api.ts
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { IngressServer } from "../ingress/http-server.js";
import type { Paths } from "../storage/paths.js";

export type ArtifactApiOptions = {
  paths: Paths;
  runtimeId: string;
  adminToken: string;
};

function checkAdmin(h: Record<string, string | string[] | undefined>, e: string) {
  const v = h["x-admin-token"];
  return (Array.isArray(v) ? v[0] : v) === e;
}

function outputsDir(paths: Paths, runtimeId: string, threadId: string, taskId: string) {
  return path.posix.join(
    paths.state(runtimeId),
    "threads",
    threadId,
    "tasks",
    taskId,
    "user-data",
    "outputs",
  );
}

export function mountArtifactApi(server: IngressServer, opts: ArtifactApiOptions): void {
  server.route("GET", "/api/tasks/:id/artifacts", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const taskId = req.params.id ?? "";
    const url = new URL(req.url, "http://x");
    const threadId = url.searchParams.get("threadId") ?? "";
    const dir = outputsDir(opts.paths, opts.runtimeId, threadId, taskId);
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      return { status: 200, body: [] };
    }
    const out: Array<{ name: string; sizeBytes: number; modifiedAt: string }> = [];
    for (const f of files) {
      if (f.startsWith("_")) continue;
      const stats = await stat(path.posix.join(dir, f));
      if (stats.isFile()) {
        out.push({
          name: f,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
    return { status: 200, body: out };
  });

  server.route("GET", "/api/tasks/:id/artifacts/:filename", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const taskId = req.params.id ?? "";
    const filename = req.params.filename ?? "";
    if (filename.includes("..") || filename.includes("/")) {
      return { status: 400, body: { error: "invalid filename" } };
    }
    const url = new URL(req.url, "http://x");
    const threadId = url.searchParams.get("threadId") ?? "";
    const dir = outputsDir(opts.paths, opts.runtimeId, threadId, taskId);
    try {
      const buf = await readFile(path.posix.join(dir, filename), "utf8");
      return {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: buf,
      };
    } catch {
      return { status: 404, body: { error: "not found" } };
    }
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- artifact-api
git add packages/bot-runtime/src/api
git commit -m "feat(api): artifact list and read endpoints"
```

Expected: 2 tests PASS。

---

### Task 6: Transcript API

**Files:**
- Create: `packages/bot-runtime/src/api/transcript-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/transcript-api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/transcript-api.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createTranscriptRepo } from "../../repositories/transcript-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountTranscriptApi } from "../transcript-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "tr-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Transcript API", () => {
  it("GET /api/threads/:id/transcript returns appended transcript entries", async () => {
    const paths = createPaths(tmp);
    const transcript = createTranscriptRepo(paths, runtimeId);
    const threadId = newId("th");
    await transcript.append(threadId, {
      messageId: newId("msg"),
      author: "user",
      kind: "text",
      text: "hello",
      at: "2026-04-29T01:00:00Z",
    });
    await transcript.append(threadId, {
      messageId: newId("msg"),
      author: "assistant",
      kind: "text",
      text: "hi",
      at: "2026-04-29T01:01:00Z",
    });

    mountTranscriptApi(server, { transcript, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/transcript`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const lines = (await r.json()) as Array<{ author: string; text: string }>;
    expect(lines).toHaveLength(2);
    expect(lines[0]?.author).toBe("user");
    expect(lines[1]?.author).toBe("assistant");
  });
});
```

如果 `transcriptRepo.append` 字段名/签名不同，按实际调整。`load`/`listForThread` 形态视 repo 而定。

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 transcript-api.ts**

```ts
// packages/bot-runtime/src/api/transcript-api.ts
import type { IngressServer } from "../ingress/http-server.js";
import type { TranscriptRepo } from "../repositories/transcript-repo.js";

export type TranscriptApiOptions = {
  transcript: TranscriptRepo;
  adminToken: string;
};

export function mountTranscriptApi(server: IngressServer, opts: TranscriptApiOptions): void {
  server.route("GET", "/api/threads/:id/transcript", async (req) => {
    const v = req.headers["x-admin-token"];
    if ((Array.isArray(v) ? v[0] : v) !== opts.adminToken) return { status: 401 };
    const threadId = req.params.id ?? "";
    const lines = await opts.transcript.listForThread(threadId);
    return { status: 200, body: lines };
  });
}
```

如果 `transcriptRepo.listForThread` 不存在，加一个（读 `state/threads/<th>/transcript.jsonl`，每行 JSON parse）。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- transcript-api
git add packages/bot-runtime/src
git commit -m "feat(api): transcript read endpoint"
```

Expected: 1 test PASS。

---

### Task 7: 写操作 API（confirm / cancel / post message）

**Files:**
- Create: `packages/bot-runtime/src/api/action-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/action-api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/action-api.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { mountActionApi } from "../action-api.js";

let tmp: string;
let server: IngressServer;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "act-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Action API", () => {
  it("POST /api/threads/:id/messages calls ingest with client source", async () => {
    const ingest = vi.fn().mockResolvedValue({ kind: "noop", intent: "chat" });
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ text: "hi", fromUserId: "u_alice" }),
    });
    expect(r.status).toBe(200);
    expect(ingest).toHaveBeenCalledTimes(1);
    const arg = ingest.mock.calls[0]![0];
    expect(arg.source).toBe("client");
    expect(arg.threadId).toBe("th_x");
    expect(arg.messageText).toBe("hi");
    expect(arg.fromUserId).toBe("u_alice");
  });

  it("POST /api/tasks/:id/confirm injects a confirm_task slash via ingest", async () => {
    const ingest = vi.fn().mockResolvedValue({ kind: "dispatched", intent: "confirm_task" });
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/tk_x/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ threadId: "th_x", fromUserId: "u_alice" }),
    });
    expect(r.status).toBe(200);
    const call = ingest.mock.calls[0]![0];
    expect(call.slashCommand).toBe("confirm");
  });

  it("returns 401 without admin token", async () => {
    const ingest = vi.fn();
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/messages`, {
      method: "POST",
      body: "{}",
    });
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 action-api.ts**

```ts
// packages/bot-runtime/src/api/action-api.ts
import type { IngressServer } from "../ingress/http-server.js";
import type { IngestFn } from "../ingress/webhook-handler.js";

export type ActionApiOptions = {
  ingest: IngestFn;
  adminToken: string;
};

function checkAdmin(h: Record<string, string | string[] | undefined>, e: string) {
  const v = h["x-admin-token"];
  return (Array.isArray(v) ? v[0] : v) === e;
}

export function mountActionApi(server: IngressServer, opts: ActionApiOptions): void {
  server.route("POST", "/api/threads/:id/messages", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const threadId = req.params.id ?? "";
    const body = JSON.parse(req.rawBody.toString("utf8")) as {
      text?: string;
      fromUserId?: string;
    };
    if (!body.text || !body.fromUserId) {
      return { status: 400, body: { error: "text and fromUserId required" } };
    }
    const result = await opts.ingest({
      threadId,
      messageId: `cm_${Date.now()}`,
      fromUserId: body.fromUserId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: body.text,
      at: new Date().toISOString(),
    });
    return { status: 200, body: { kind: result.kind } };
  });

  server.route("POST", "/api/tasks/:id/confirm", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const body = JSON.parse(req.rawBody.toString("utf8")) as {
      threadId?: string;
      fromUserId?: string;
    };
    if (!body.threadId || !body.fromUserId) {
      return { status: 400, body: { error: "threadId and fromUserId required" } };
    }
    const result = await opts.ingest({
      threadId: body.threadId,
      messageId: `cm_${Date.now()}`,
      fromUserId: body.fromUserId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: new Date().toISOString(),
    });
    return { status: 200, body: { kind: result.kind } };
  });

  server.route("POST", "/api/tasks/:id/cancel", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const body = JSON.parse(req.rawBody.toString("utf8")) as {
      threadId?: string;
      fromUserId?: string;
    };
    if (!body.threadId || !body.fromUserId) {
      return { status: 400, body: { error: "threadId and fromUserId required" } };
    }
    const result = await opts.ingest({
      threadId: body.threadId,
      messageId: `cm_${Date.now()}`,
      fromUserId: body.fromUserId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "cancel",
      messageText: "/cancel",
      at: new Date().toISOString(),
    });
    return { status: 200, body: { kind: result.kind } };
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- action-api
git add packages/bot-runtime/src/api
git commit -m "feat(api): client message/confirm/cancel actions"
```

Expected: 3 tests PASS。

---

### Task 8: 把 thread/task/plan/artifact/transcript/action API 接入 admin mount

**Files:**
- Modify: `packages/bot-runtime/src/api/mount.ts`
- Modify: `packages/bot-runtime/src/api/__tests__/mount.test.ts`
- Modify: `packages/bot-runtime/src/runtime/hybrid-host.ts`
- Modify: `packages/bot-runtime/src/runtime/__tests__/hybrid-host-channel.test.ts` (regression check)

- [ ] **Step 1: 在 mount.ts 加入参数**

`AdminApiOptions` 增加 4 个可选字段（threadRepo, taskRepo, planRepo, transcript, paths, runtimeId, ingest）。当提供时挂载对应 API。

```ts
export type AdminApiOptions = {
  adminToken: string;
  channelStore: ChannelConfigStore;
  onChannelConfigChanged?: (provider: string) => void | Promise<void>;
  threadRepo?: ThreadRepo;
  taskRepo?: TaskRepo;
  planRepo?: PlanRepo;
  transcript?: TranscriptRepo;
  paths?: Paths;
  runtimeId?: string;
  ingest?: IngestFn;
};
```

实现里：

```ts
mountChannelConfigApi(server, { ... });
if (opts.threadRepo) mountThreadApi(server, { threadRepo: opts.threadRepo, adminToken: opts.adminToken, paths: opts.paths, runtimeId: opts.runtimeId });
if (opts.taskRepo) mountTaskApi(server, { taskRepo: opts.taskRepo, adminToken: opts.adminToken });
if (opts.planRepo) mountPlanApi(server, { planRepo: opts.planRepo, adminToken: opts.adminToken });
if (opts.transcript) mountTranscriptApi(server, { transcript: opts.transcript, adminToken: opts.adminToken });
if (opts.paths && opts.runtimeId) mountArtifactApi(server, { paths: opts.paths, runtimeId: opts.runtimeId, adminToken: opts.adminToken });
if (opts.ingest) mountActionApi(server, { ingest: opts.ingest, adminToken: opts.adminToken });
```

- [ ] **Step 2: 在 hybrid-host.ts 注入新依赖**

调用 `mountAdminApi` 时新增传入：

```ts
mountAdminApi(ingress, {
  adminToken: input.channel.adminToken,
  channelStore,
  onChannelConfigChanged: rebuildProvider,
  threadRepo: master.threadRepo,
  taskRepo: master.taskRepo,
  planRepo: master.planRepo,
  transcript: master.transcript,
  paths: input.paths,
  runtimeId: input.runtimeId,
  ingest: master.ingestInbound,
});
```

- [ ] **Step 3: 在 mount.test.ts 加测试**

```ts
it("registers thread API when threadRepo provided", async () => {
  const tmp = await mkdtemp(path.join(tmpdir(), "mn2-"));
  const paths = createPaths(tmp);
  const threadRepo = createThreadRepo(paths, "rt_test");
  mountAdminApi(server, {
    adminToken: "a",
    channelStore: createChannelConfigStore(paths, "rt_test"),
    threadRepo,
    paths,
    runtimeId: "rt_test",
  });
  const { port } = await server.listen(0);
  const r = await fetch(`http://127.0.0.1:${port}/api/threads`, {
    headers: { "x-admin-token": "a" },
  });
  expect(r.status).toBe(200);
});
```

- [ ] **Step 4: 全量跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test
git add packages/bot-runtime/src
git commit -m "feat(runtime): expose thread/task/plan/artifact/transcript/action APIs via admin mount"
```

Expected: 全部 PASS（含 hybrid-host-channel）。

---

## Phase B — SSE 事件流（4 tasks）

### Task 9: SSE writer 工具

**Files:**
- Create: `packages/bot-runtime/src/api/sse.ts`
- Create: `packages/bot-runtime/src/api/__tests__/sse.test.ts`

**目的：** 把 EventEmitter / iterable 转成 SSE 字节流写到 ServerResponse。Plan 2 的 IngressServer 当前 handler 返回 `{ status, body }`，要扩展支持 streaming。

- [ ] **Step 1: 增强 IngressServer 支持 streaming response**

handler 可以返回 `{ status, headers, stream: (write: (chunk: string) => void, end: () => void) => Promise<void> }`。如果存在 `stream`，使用 chunked transfer，不走 res.end(JSON)。

修改 `packages/bot-runtime/src/ingress/http-server.ts`，加 `IngressStreamingResponse` 类型，handler 返回 union。给 `IngressResponse` 改造：

```ts
export type IngressResponse =
  | { status: number; headers?: Record<string, string>; body?: unknown }
  | {
      status: number;
      headers?: Record<string, string>;
      stream: (write: (chunk: string) => void, end: () => void, signal: AbortSignal) => Promise<void>;
    };
```

在 server 实现里检测 `"stream" in result`：写 headers，然后 `await result.stream((c) => res.write(c), () => res.end(), abortSignal)`。

加测试到 http-server.test.ts：

```ts
it("supports streaming responses", async () => {
  server = createIngressServer();
  server.route("GET", "/stream", async () => ({
    status: 200,
    headers: { "content-type": "text/event-stream" },
    stream: async (write, end) => {
      write("hello\n");
      write("world\n");
      end();
    },
  }));
  const { port } = await server.listen(0);
  const res = await fetch(`http://127.0.0.1:${port}/stream`);
  expect(await res.text()).toBe("hello\nworld\n");
});
```

跑测试，确认通过。

- [ ] **Step 2: 写 SSE writer 测试**

```ts
// packages/bot-runtime/src/api/__tests__/sse.test.ts
import { describe, expect, it } from "vitest";
import { encodeSseEvent } from "../sse.js";

describe("encodeSseEvent", () => {
  it("encodes a custom event with id, event, and JSON data", () => {
    const got = encodeSseEvent({ id: "1", event: "custom", data: { foo: 1 } });
    expect(got).toBe(`id: 1\nevent: custom\ndata: {"foo":1}\n\n`);
  });

  it("supports plain comments / heartbeats", () => {
    expect(encodeSseEvent({ comment: "ping" })).toBe(`: ping\n\n`);
  });

  it("escapes newlines in data field", () => {
    const got = encodeSseEvent({ data: "line1\nline2" });
    expect(got).toContain("data: line1\ndata: line2\n");
  });
});
```

- [ ] **Step 3: 实现 sse.ts**

```ts
// packages/bot-runtime/src/api/sse.ts
export type SseEvent = {
  id?: string;
  event?: string;
  data?: string | object;
  comment?: string;
};

export function encodeSseEvent(e: SseEvent): string {
  if (e.comment !== undefined) return `: ${e.comment}\n\n`;
  const parts: string[] = [];
  if (e.id !== undefined) parts.push(`id: ${e.id}`);
  if (e.event !== undefined) parts.push(`event: ${e.event}`);
  if (e.data !== undefined) {
    const dataStr = typeof e.data === "string" ? e.data : JSON.stringify(e.data);
    for (const line of dataStr.split("\n")) {
      parts.push(`data: ${line}`);
    }
  }
  return parts.join("\n") + "\n\n";
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- sse
git add packages/bot-runtime/src
git commit -m "feat(api): SSE event encoder + streaming response support in ingress"
```

Expected: 3 + http-server 新增 1 = 全 PASS。

---

### Task 10: ThreadEventBroadcaster（内存订阅 + events.jsonl tail）

**Files:**
- Create: `packages/bot-runtime/src/api/thread-event-broadcaster.ts`
- Create: `packages/bot-runtime/src/api/__tests__/thread-event-broadcaster.test.ts`

**目的：** 给一个 threadId，把 thread 内所有 task 的 `events.jsonl` 文件 tail 起来，加上一个内存 EventEmitter（thread 级别广播），合并成一个事件流。客户端订阅 → broadcaster.subscribe(threadId, sinceCursor) → AsyncIterable<{id, kind, payload}>。

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/src/api/__tests__/thread-event-broadcaster.test.ts
import { mkdtemp, mkdir, writeFile, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createThreadEventBroadcaster } from "../thread-event-broadcaster.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "teb-"));
});

describe("ThreadEventBroadcaster", () => {
  it("yields existing events.jsonl entries for a thread, oldest first", async () => {
    const paths = createPaths(tmp);
    const threadId = newId("th");
    const taskId = newId("tk");
    const eventsDir = path.posix.join(
      paths.state(runtimeId),
      "threads",
      threadId,
      "tasks",
      taskId,
    );
    await mkdir(eventsDir, { recursive: true });
    await writeFile(
      path.posix.join(eventsDir, "events.jsonl"),
      [
        JSON.stringify({ id: "ev_1", kind: "executor_started", taskId, at: "2026-04-29T01:00:00Z" }),
        JSON.stringify({
          id: "ev_2",
          kind: "executor_finished",
          taskId,
          at: "2026-04-29T01:01:00Z",
        }),
      ].join("\n") + "\n",
    );
    const bc = createThreadEventBroadcaster({ paths, runtimeId });
    const events: string[] = [];
    const sub = bc.subscribe(threadId);
    for await (const e of sub.iterate({ replayFromCursor: null, abortSignal: sub.abort })) {
      events.push(e.id);
      if (events.length === 2) {
        sub.abort.abort();
        break;
      }
    }
    expect(events).toEqual(["ev_1", "ev_2"]);
  });

  it("forwards thread-level broadcast events to subscribers", async () => {
    const paths = createPaths(tmp);
    const threadId = newId("th");
    await mkdir(path.posix.join(paths.state(runtimeId), "threads", threadId), {
      recursive: true,
    });

    const bc = createThreadEventBroadcaster({ paths, runtimeId });
    const sub = bc.subscribe(threadId);
    const collected: string[] = [];
    const consumer = (async () => {
      for await (const e of sub.iterate({ replayFromCursor: null, abortSignal: sub.abort })) {
        collected.push(e.id);
        if (collected.length === 1) {
          sub.abort.abort();
          break;
        }
      }
    })();
    await new Promise((r) => setTimeout(r, 20));
    bc.broadcast(threadId, { id: "thr_ev_1", kind: "values", at: "x" });
    await consumer;
    expect(collected).toEqual(["thr_ev_1"]);
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 thread-event-broadcaster.ts**

```ts
// packages/bot-runtime/src/api/thread-event-broadcaster.ts
import { readFile, readdir } from "node:fs/promises";
import { EventEmitter } from "node:events";
import path from "node:path";
import type { Paths } from "../storage/paths.js";

export type ThreadEvent = {
  id: string;
  kind: string;
  at: string;
  taskId?: string;
  [k: string]: unknown;
};

export type ThreadEventSubscription = {
  iterate(args: {
    replayFromCursor: string | null;
    abortSignal: AbortController;
  }): AsyncIterable<ThreadEvent>;
  abort: AbortController;
};

export type ThreadEventBroadcaster = {
  subscribe(threadId: string): ThreadEventSubscription;
  broadcast(threadId: string, event: ThreadEvent): void;
};

export function createThreadEventBroadcaster(deps: {
  paths: Paths;
  runtimeId: string;
}): ThreadEventBroadcaster {
  const ee = new EventEmitter();
  ee.setMaxListeners(100);

  async function readBacklog(threadId: string, fromCursor: string | null): Promise<ThreadEvent[]> {
    const tasksDir = path.posix.join(
      deps.paths.state(deps.runtimeId),
      "threads",
      threadId,
      "tasks",
    );
    let taskDirs: string[] = [];
    try {
      taskDirs = await readdir(tasksDir);
    } catch {
      return [];
    }
    const all: ThreadEvent[] = [];
    for (const td of taskDirs) {
      const eventsFile = path.posix.join(tasksDir, td, "events.jsonl");
      try {
        const content = await readFile(eventsFile, "utf8");
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ThreadEvent;
          if (fromCursor === null || e.id > fromCursor) all.push(e);
        }
      } catch {
        /* skip */
      }
    }
    all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return all;
  }

  return {
    subscribe(threadId) {
      const abort = new AbortController();
      const subject: ThreadEventSubscription = {
        abort,
        iterate({ replayFromCursor, abortSignal }) {
          const buf: ThreadEvent[] = [];
          let resolveNext: ((v: ThreadEvent | null) => void) | null = null;
          const onEvent = (e: ThreadEvent) => {
            if (resolveNext) {
              const r = resolveNext;
              resolveNext = null;
              r(e);
            } else {
              buf.push(e);
            }
          };
          ee.on(`thread:${threadId}`, onEvent);
          abortSignal.signal.addEventListener("abort", () => {
            ee.off(`thread:${threadId}`, onEvent);
            if (resolveNext) {
              const r = resolveNext;
              resolveNext = null;
              r(null);
            }
          });
          return (async function* () {
            const backlog = await readBacklog(threadId, replayFromCursor);
            for (const e of backlog) yield e;
            while (!abortSignal.signal.aborted) {
              const next = await new Promise<ThreadEvent | null>((res) => {
                if (buf.length > 0) {
                  res(buf.shift()!);
                  return;
                }
                resolveNext = res;
              });
              if (next === null) return;
              yield next;
            }
          })();
        },
      };
      return subject;
    },
    broadcast(threadId, event) {
      ee.emit(`thread:${threadId}`, event);
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- thread-event-broadcaster
git add packages/bot-runtime/src/api
git commit -m "feat(api): thread event broadcaster with backlog replay + memory broadcast"
```

Expected: 2 tests PASS。

---

### Task 11: SSE 端点 GET /api/threads/:id/events

**Files:**
- Create: `packages/bot-runtime/src/api/events-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/events-api.test.ts`

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/src/api/__tests__/events-api.test.ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createThreadEventBroadcaster } from "../thread-event-broadcaster.js";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountEventsApi } from "../events-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ev-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Events API (SSE)", () => {
  it("GET /api/threads/:id/events streams existing backlog as SSE events", async () => {
    const paths = createPaths(tmp);
    const threadId = newId("th");
    const taskId = newId("tk");
    const tdir = path.posix.join(paths.state(runtimeId), "threads", threadId, "tasks", taskId);
    await mkdir(tdir, { recursive: true });
    await writeFile(
      path.posix.join(tdir, "events.jsonl"),
      JSON.stringify({ id: "ev_1", kind: "executor_started", at: "2026-04-29T01:00:00Z" }) + "\n",
    );

    const bc = createThreadEventBroadcaster({ paths, runtimeId });
    mountEventsApi(server, { broadcaster: bc, adminToken: "a" });
    const { port } = await server.listen(0);

    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/events`, {
      headers: { "x-admin-token": "a" },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    const collected: string[] = [];
    while (collected.join("").indexOf("ev_1") < 0) {
      const { value, done } = await reader.read();
      if (done) break;
      collected.push(dec.decode(value));
    }
    expect(collected.join("")).toContain("id: ev_1");
    ctrl.abort();
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 events-api.ts**

```ts
// packages/bot-runtime/src/api/events-api.ts
import type { IngressServer } from "../ingress/http-server.js";
import { encodeSseEvent } from "./sse.js";
import type { ThreadEventBroadcaster } from "./thread-event-broadcaster.js";

export type EventsApiOptions = {
  broadcaster: ThreadEventBroadcaster;
  adminToken: string;
};

export function mountEventsApi(server: IngressServer, opts: EventsApiOptions): void {
  server.route("GET", "/api/threads/:id/events", async (req) => {
    const tok = req.headers["x-admin-token"];
    if ((Array.isArray(tok) ? tok[0] : tok) !== opts.adminToken) return { status: 401 };
    const threadId = req.params.id ?? "";
    const url = new URL(req.url, "http://x");
    const cursor = url.searchParams.get("cursor");
    const sub = opts.broadcaster.subscribe(threadId);
    return {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      stream: async (write, end, abort) => {
        write(encodeSseEvent({ comment: "subscribed" }));
        const aborter = new AbortController();
        abort.addEventListener("abort", () => {
          sub.abort.abort();
          aborter.abort();
        });
        try {
          for await (const e of sub.iterate({ replayFromCursor: cursor, abortSignal: sub.abort })) {
            write(encodeSseEvent({ id: e.id, event: e.kind, data: e }));
          }
        } finally {
          end();
        }
      },
    };
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- events-api
git add packages/bot-runtime/src/api
git commit -m "feat(api): SSE events endpoint with backlog + cursor resume"
```

Expected: 1 test PASS。

---

### Task 12: HybridHost 注入 broadcaster + Executor 接入广播

**Files:**
- Modify: `packages/bot-runtime/src/runtime/hybrid-host.ts`
- Modify: `packages/bot-runtime/src/api/mount.ts`
- Modify: `packages/bot-runtime/src/runtime/__tests__/hybrid-host-channel.test.ts`

**目的：** HybridHost 创建一个 `ThreadEventBroadcaster`，把 events-api 挂上去；ThreadLoop / Executor 在写状态/事件时调用 `broadcaster.broadcast(threadId, event)`，让 SSE 实时收到。

- [ ] **Step 1: AdminApiOptions 加 broadcaster**

```ts
broadcaster?: ThreadEventBroadcaster;
```

mount 实现：

```ts
if (opts.broadcaster) mountEventsApi(server, { broadcaster: opts.broadcaster, adminToken: opts.adminToken });
```

- [ ] **Step 2: hybrid-host.ts 创建 broadcaster**

```ts
const broadcaster = createThreadEventBroadcaster({ paths: input.paths, runtimeId: input.runtimeId });
mountAdminApi(ingress, { ..., broadcaster });
```

把 broadcaster 透出来挂到 `host.broadcaster`，方便 ThreadLoop / Executor 后续调用：

```ts
return { ..., broadcaster };
```

ThreadLoop 在 confirm/draft 等关键节点调用 `broadcaster.broadcast(threadId, { id: newId('thev'), kind: 'thread_state', at: now, data: {...}})`. **v1 暂不要求 ThreadLoop 真接进去**，只暴露 broadcaster 让客户端能 subscribe；events.jsonl 在 Executor 写盘后通过 backlog 一定会被读到（只是延迟，不丢）。所以 v1 先不改 ThreadLoop / Executor，仅让 broadcaster 存在即可。

- [ ] **Step 3: hybrid-host-channel.test.ts 加测试**

```ts
it("exposes broadcaster + SSE endpoint", async () => {
  host = await createHybridHost({ ..., channel: { adminToken: "admin", ingressPort: 0 } });
  expect(typeof host.broadcaster.broadcast).toBe("function");
  // SSE endpoint exists
  const ctrl = new AbortController();
  const r = await fetch(`http://127.0.0.1:${host.ingressPort}/api/threads/th_x/events`, {
    headers: { "x-admin-token": "admin" },
    signal: ctrl.signal,
  });
  expect(r.status).toBe(200);
  ctrl.abort();
});
```

- [ ] **Step 4: 跑全套测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test
git add packages/bot-runtime/src
git commit -m "feat(runtime): wire ThreadEventBroadcaster + SSE into HybridHost"
```

Expected: 全部 PASS。

---

## Phase C — 前端脚手架（5 tasks）

### Task 13: apps/web Vite 工程脚手架

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/styles.css`
- Modify: `pnpm-workspace.yaml`（加 `apps/*`）
- Modify: `biome.json`（apps/web/dist 加入 ignore）
- Modify: `package.json`（root scripts 不动；workspace 自动 pickup）
- Create: `.gitignore`（确认 apps/*/dist 已 ignore）

- [ ] **Step 1: 修改 pnpm-workspace.yaml**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 2: 创建 apps/web/package.json**

```json
{
  "name": "@ai-employee/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview --port 5173",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "typescript": "5.6.2",
    "vite": "^5.4.6",
    "vitest": "^2.1.1",
    "@testing-library/react": "^16.0.1",
    "@testing-library/jest-dom": "^6.5.0"
  }
}
```

- [ ] **Step 3: tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src", "vite.config.ts"]
}
```

- [ ] **Step 4: vite.config.ts**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/webhooks": "http://127.0.0.1:8787",
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 5: index.html / main.tsx / app.tsx / styles.css / test-setup.ts**

```html
<!-- apps/web/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI Employee</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```ts
// apps/web/src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./app.js";

const root = document.getElementById("root");
if (!root) throw new Error("root missing");
ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
```

```tsx
// apps/web/src/app.tsx
import { Link, Route, Routes } from "react-router-dom";

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <Link to="/">AI Employee</Link>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<div>Threads list (Task 17)</div>} />
        </Routes>
      </main>
    </div>
  );
}
```

```css
/* apps/web/src/styles.css */
:root { font-family: ui-sans-serif, system-ui, -apple-system; }
body { margin: 0; padding: 0; }
.app { display: flex; flex-direction: column; height: 100vh; }
.app-header { padding: 12px 16px; border-bottom: 1px solid #ddd; }
main { flex: 1; overflow: auto; padding: 16px; }
```

```ts
// apps/web/src/test-setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 6: 修改 biome.json**

把 `"apps/*/dist/**"` 加入 `files.ignore`。

- [ ] **Step 7: 安装依赖 + 第一次构建**

```bash
pnpm install
pnpm --filter @ai-employee/web build
```

如果第一次构建报错（比如 jsx 没配好），按报错修。Expected: build succeeds, 输出 `apps/web/dist/`。

- [ ] **Step 8: commit**

```bash
git add apps/web pnpm-workspace.yaml pnpm-lock.yaml biome.json
git commit -m "feat(web): vite + react + ts scaffold for client app"
```

---

### Task 14: API client（typed fetch wrapper）

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/api/__tests__/client.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// apps/web/src/api/__tests__/client.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApiClient } from "../client.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ApiClient", () => {
  it("getThreads attaches admin token header", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: "th_1", title: "T" }],
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "http://x", adminToken: "tok" });
    const list = await client.getThreads();
    expect(list).toEqual([{ id: "th_1", title: "T" }]);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers["x-admin-token"]).toBe("tok");
  });

  it("postMessage POSTs JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ kind: "draft_created" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = createApiClient({ baseUrl: "http://x", adminToken: "tok" });
    await client.postMessage("th_1", { text: "hi", fromUserId: "u_a" });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ text: "hi", fromUserId: "u_a" });
  });

  it("throws on non-2xx with body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "nope",
    }));
    const client = createApiClient({ baseUrl: "http://x", adminToken: "tok" });
    await expect(client.getThreads()).rejects.toThrow(/401/);
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

`pnpm --filter @ai-employee/web test -- client`

- [ ] **Step 3: 实现 client.ts**

```ts
// apps/web/src/api/client.ts
export type ApiClient = {
  getThreads(): Promise<Array<{ id: string; title: string; status: string }>>;
  getThread(id: string): Promise<{ id: string; title: string; status: string }>;
  getTasks(threadId: string): Promise<unknown[]>;
  getTask(taskId: string): Promise<unknown>;
  getPlan(taskId: string): Promise<unknown>;
  getArtifacts(taskId: string, threadId: string): Promise<Array<{ name: string; sizeBytes: number; modifiedAt: string }>>;
  getArtifact(taskId: string, threadId: string, name: string): Promise<string>;
  getTranscript(threadId: string): Promise<unknown[]>;
  postMessage(threadId: string, body: { text: string; fromUserId: string }): Promise<{ kind: string }>;
  confirmTask(taskId: string, body: { threadId: string; fromUserId: string }): Promise<{ kind: string }>;
  cancelTask(taskId: string, body: { threadId: string; fromUserId: string }): Promise<{ kind: string }>;
  getChannels(): Promise<unknown[]>;
  putChannel(provider: string, body: unknown): Promise<unknown>;
};

export type CreateApiClientInput = {
  baseUrl: string;
  adminToken: string;
};

export function createApiClient(input: CreateApiClientInput): ApiClient {
  const headers = {
    "x-admin-token": input.adminToken,
    "content-type": "application/json",
  };

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${input.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${text}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  return {
    getThreads: () => request("GET", "/api/threads"),
    getThread: (id) => request("GET", `/api/threads/${id}`),
    getTasks: (threadId) => request("GET", `/api/threads/${threadId}/tasks`),
    getTask: (taskId) => request("GET", `/api/tasks/${taskId}`),
    getPlan: (taskId) => request("GET", `/api/tasks/${taskId}/plan`),
    getArtifacts: (taskId, threadId) =>
      request("GET", `/api/tasks/${taskId}/artifacts?threadId=${encodeURIComponent(threadId)}`),
    getArtifact: (taskId, threadId, name) =>
      request("GET", `/api/tasks/${taskId}/artifacts/${encodeURIComponent(name)}?threadId=${encodeURIComponent(threadId)}`),
    getTranscript: (threadId) => request("GET", `/api/threads/${threadId}/transcript`),
    postMessage: (threadId, body) => request("POST", `/api/threads/${threadId}/messages`, body),
    confirmTask: (taskId, body) => request("POST", `/api/tasks/${taskId}/confirm`, body),
    cancelTask: (taskId, body) => request("POST", `/api/tasks/${taskId}/cancel`, body),
    getChannels: () => request("GET", "/api/channels"),
    putChannel: (provider, body) => request("PUT", `/api/channels/${provider}`, body),
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/web test
git add apps/web/src
git commit -m "feat(web): typed API client wrapping admin token + JSON fetch"
```

Expected: 3 tests PASS。

---

### Task 15: useEventStream hook（EventSource + 重连）

**Files:**
- Create: `apps/web/src/hooks/use-event-stream.ts`
- Create: `apps/web/src/hooks/__tests__/use-event-stream.test.ts`

- [ ] **Step 1: 写失败测试（jsdom 不内置 EventSource，要 mock）**

```ts
// apps/web/src/hooks/__tests__/use-event-stream.test.ts
import { renderHook, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useEventStream } from "../use-event-stream.js";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onopen: ((e: Event) => void) | null = null;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }
}

afterEach(() => {
  FakeEventSource.instances = [];
  vi.unstubAllGlobals();
});

describe("useEventStream", () => {
  it("subscribes to URL and accumulates events", async () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const { result } = renderHook(() =>
      useEventStream<{ id: string; kind: string }>({ url: "/api/threads/th_1/events" }),
    );
    expect(FakeEventSource.instances).toHaveLength(1);

    await act(async () => {
      FakeEventSource.instances[0]!.emit({ id: "ev_1", kind: "executor_started" });
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.id).toBe("ev_1");
  });

  it("closes EventSource on unmount", () => {
    vi.stubGlobal("EventSource", FakeEventSource);
    const { unmount } = renderHook(() =>
      useEventStream<{ id: string; kind: string }>({ url: "/api/threads/th_1/events" }),
    );
    unmount();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 use-event-stream.ts**

```ts
// apps/web/src/hooks/use-event-stream.ts
import { useEffect, useState } from "react";

export type UseEventStreamInput = {
  url: string;
};

export type UseEventStreamResult<T> = {
  events: T[];
  status: "connecting" | "open" | "error" | "closed";
};

export function useEventStream<T = unknown>(input: UseEventStreamInput): UseEventStreamResult<T> {
  const [events, setEvents] = useState<T[]>([]);
  const [status, setStatus] = useState<UseEventStreamResult<T>["status"]>("connecting");

  useEffect(() => {
    const es = new EventSource(input.url);
    const onOpen = () => setStatus("open");
    const onError = () => setStatus("error");
    const onMessage = (e: MessageEvent) => {
      try {
        const parsed = JSON.parse(e.data) as T;
        setEvents((prev) => [...prev, parsed]);
      } catch {
        /* ignore unparseable */
      }
    };
    es.addEventListener("open", onOpen);
    es.addEventListener("error", onError);
    es.addEventListener("message", onMessage);
    return () => {
      es.close();
      setStatus("closed");
    };
  }, [input.url]);

  return { events, status };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/web test
git add apps/web/src
git commit -m "feat(web): useEventStream hook with EventSource"
```

Expected: 2 tests PASS。

---

### Task 16: AppContext（admin token + base URL 配置）

**Files:**
- Create: `apps/web/src/app-context.tsx`
- Modify: `apps/web/src/app.tsx`

**目的：** 一处管理 admin token + base URL，组件通过 hook 取 client。开发时 token 写死在 localStorage / 环境变量；v1 不做登录页。

- [ ] **Step 1: 实现 app-context.tsx**

```tsx
// apps/web/src/app-context.tsx
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { type ApiClient, createApiClient } from "./api/client.js";

type AppCtx = {
  client: ApiClient;
  adminToken: string;
  setAdminToken(t: string): void;
  baseUrl: string;
};

const Ctx = createContext<AppCtx | null>(null);

export function AppContextProvider({ children }: { children: ReactNode }) {
  const [adminToken, setAdminToken] = useState<string>(() => localStorage.getItem("adminToken") ?? "");
  const baseUrl = "";  // empty → relative; vite proxy handles /api in dev
  const client = useMemo(() => createApiClient({ baseUrl, adminToken }), [adminToken]);
  function update(t: string) {
    setAdminToken(t);
    localStorage.setItem("adminToken", t);
  }
  return <Ctx.Provider value={{ client, adminToken, setAdminToken: update, baseUrl }}>{children}</Ctx.Provider>;
}

export function useAppContext(): AppCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppContext outside provider");
  return ctx;
}
```

- [ ] **Step 2: 包到 app.tsx**

```tsx
// apps/web/src/app.tsx
import { Link, Route, Routes } from "react-router-dom";
import { AppContextProvider } from "./app-context.js";
import { TokenInput } from "./components/token-input.js";  // Task 17 创建

export function App() {
  return (
    <AppContextProvider>
      <div className="app">
        <header className="app-header">
          <Link to="/">AI Employee</Link>
          <TokenInput />
        </header>
        <main>
          <Routes>
            <Route path="/" element={<div>Threads list (Task 17)</div>} />
          </Routes>
        </main>
      </div>
    </AppContextProvider>
  );
}
```

由于 token-input 还没实现，临时用占位组件：

```tsx
// apps/web/src/components/token-input.tsx
import { useAppContext } from "../app-context.js";
export function TokenInput() {
  const { adminToken, setAdminToken } = useAppContext();
  return (
    <input
      placeholder="admin token"
      value={adminToken}
      onChange={(e) => setAdminToken(e.target.value)}
      style={{ marginLeft: 16 }}
    />
  );
}
```

- [ ] **Step 3: 构建确认通过**

```bash
pnpm --filter @ai-employee/web build
```

- [ ] **Step 4: commit**

```bash
git add apps/web/src
git commit -m "feat(web): AppContext provider + admin token input"
```

---

### Task 17: ThreadList 页

**Files:**
- Create: `apps/web/src/pages/thread-list.tsx`
- Create: `apps/web/src/pages/__tests__/thread-list.test.tsx`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: 写测试**

```tsx
// apps/web/src/pages/__tests__/thread-list.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { ThreadList } from "../thread-list.js";

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getThreads: async () => [
      { id: "th_1", title: "Project A", status: "chatting" },
      { id: "th_2", title: "Project B", status: "working" },
    ],
  }),
}));

describe("ThreadList", () => {
  it("renders threads from API", async () => {
    render(
      <MemoryRouter>
        <AppContextProvider>
          <ThreadList />
        </AppContextProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Project A")).toBeInTheDocument());
    expect(screen.getByText("Project B")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 thread-list.tsx**

```tsx
// apps/web/src/pages/thread-list.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAppContext } from "../app-context.js";

type ThreadSummary = { id: string; title: string; status: string };

export function ThreadList() {
  const { client } = useAppContext();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = (await client.getThreads()) as ThreadSummary[];
        if (alive) setThreads(list);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [client]);

  if (error) return <div className="error">Error: {error}</div>;
  return (
    <div className="thread-list">
      <h2>Threads</h2>
      <ul>
        {threads.map((t) => (
          <li key={t.id}>
            <Link to={`/threads/${t.id}`}>
              {t.title} <span className="status">[{t.status}]</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: 路由挂载**

`app.tsx` 路由改为：

```tsx
<Routes>
  <Route path="/" element={<ThreadList />} />
  <Route path="/threads/:id" element={<div>Thread detail (Task 18)</div>} />
</Routes>
```

- [ ] **Step 5: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/web test
git add apps/web/src
git commit -m "feat(web): thread list page"
```

Expected: 1 test PASS。

---

## Phase D — 前端核心视图（6 tasks）

### Task 18: ThreadDetail 三栏布局 + 路由

**Files:**
- Create: `apps/web/src/pages/thread-detail.tsx`
- Create: `apps/web/src/pages/__tests__/thread-detail.test.tsx`
- Modify: `apps/web/src/app.tsx`

**布局：**
- 左栏：对话面板（transcript 列表 + 输入框）
- 中栏：当前 active task 卡片 + plan 步骤
- 右栏：artifact 列表 + 状态摘要

v1 不要求复杂样式，flex 三列 + min-width 即可。

- [ ] **Step 1: 写测试**

```tsx
// apps/web/src/pages/__tests__/thread-detail.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AppContextProvider } from "../../app-context.js";
import { ThreadDetail } from "../thread-detail.js";

vi.mock("../../api/client.js", () => ({
  createApiClient: () => ({
    getThread: async () => ({ id: "th_1", title: "Project", status: "chatting" }),
    getTasks: async () => [{ id: "tk_1", title: "Task A", status: "running" }],
    getTranscript: async () => [],
    getPlan: async () => null,
    getArtifacts: async () => [],
  }),
}));

vi.mock("../../hooks/use-event-stream.js", () => ({
  useEventStream: () => ({ events: [], status: "open" }),
}));

describe("ThreadDetail", () => {
  it("renders three panels with thread data", async () => {
    render(
      <MemoryRouter initialEntries={["/threads/th_1"]}>
        <AppContextProvider>
          <Routes>
            <Route path="/threads/:id" element={<ThreadDetail />} />
          </Routes>
        </AppContextProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText("Project")).toBeInTheDocument());
    expect(screen.getByText("Task A")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 跑测试 → FAIL**

- [ ] **Step 3: 实现 thread-detail.tsx**

```tsx
// apps/web/src/pages/thread-detail.tsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAppContext } from "../app-context.js";
import { useEventStream } from "../hooks/use-event-stream.js";

type Thread = { id: string; title: string; status: string };
type TaskSummary = { id: string; title: string; status: string };

export function ThreadDetail() {
  const { id } = useParams<{ id: string }>();
  const { client, adminToken } = useAppContext();
  const [thread, setThread] = useState<Thread | null>(null);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [t, ts] = await Promise.all([
        client.getThread(id) as Promise<Thread>,
        client.getTasks(id) as Promise<TaskSummary[]>,
      ]);
      setThread(t);
      setTasks(ts);
    })();
  }, [client, id]);

  // SSE subscribe
  const sseUrl = id ? `/api/threads/${id}/events?_token=${encodeURIComponent(adminToken)}` : "";
  // Note: EventSource doesn't support custom headers; we pass admin-token via query-string fallback.
  // Backend should also accept query-string token for the events route in Task 19.
  useEventStream({ url: sseUrl });

  if (!thread) return <div>Loading...</div>;
  return (
    <div className="thread-detail">
      <div className="panel left">
        <h3>{thread.title}</h3>
        <p className="status">{thread.status}</p>
        <div>(Conversation panel — Task 19)</div>
      </div>
      <div className="panel center">
        <h4>Tasks</h4>
        <ul>
          {tasks.map((t) => (
            <li key={t.id}>
              {t.title} [{t.status}]
            </li>
          ))}
        </ul>
        <div>(Plan panel — Task 21)</div>
      </div>
      <div className="panel right">
        <h4>Artifacts</h4>
        <div>(Task 22)</div>
      </div>
    </div>
  );
}
```

加 css：

```css
/* append to apps/web/src/styles.css */
.thread-detail { display: flex; gap: 16px; height: 100%; }
.thread-detail .panel { flex: 1; min-width: 280px; padding: 12px; border: 1px solid #eee; overflow: auto; }
```

- [ ] **Step 4: app.tsx 路由更新**

```tsx
<Route path="/threads/:id" element={<ThreadDetail />} />
```

- [ ] **Step 5: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/web test -- thread-detail
git add apps/web/src
git commit -m "feat(web): thread detail three-panel layout"
```

Expected: 1 test PASS。

---

### Task 19: Conversation panel + 后端支持 query-string token + post message

**Files:**
- Modify: `packages/bot-runtime/src/api/events-api.ts`（accept `_token` query as fallback）
- Modify: `packages/bot-runtime/src/api/__tests__/events-api.test.ts`（regression）
- Create: `apps/web/src/components/conversation-panel.tsx`
- Modify: `apps/web/src/pages/thread-detail.tsx`（接入 panel）

- [ ] **Step 1: events-api.ts 接受 query-string token**

EventSource 无法发自定义 header，所以后端 SSE 路由要兼容 `?_token=`。

```ts
// 增强 checkAdmin
function checkAdmin(req: { headers, url }, expected: string) {
  const v = req.headers["x-admin-token"];
  const headerVal = Array.isArray(v) ? v[0] : v;
  if (headerVal === expected) return true;
  const u = new URL(req.url, "http://x");
  return u.searchParams.get("_token") === expected;
}
```

events-api.ts 改 checkAdmin 路径，并加测试 `?_token=` 形式 200。

- [ ] **Step 2: 写 conversation-panel 组件**

```tsx
// apps/web/src/components/conversation-panel.tsx
import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type TranscriptEntry = {
  messageId: string;
  author: string;
  kind: string;
  text: string;
  at: string;
};

export function ConversationPanel({ threadId }: { threadId: string }) {
  const { client } = useAppContext();
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const lines = (await client.getTranscript(threadId)) as TranscriptEntry[];
      if (alive) setEntries(lines);
    })();
    return () => {
      alive = false;
    };
  }, [client, threadId]);

  async function send() {
    if (!draft.trim()) return;
    await client.postMessage(threadId, { text: draft, fromUserId: "u_client" });
    setDraft("");
    const lines = (await client.getTranscript(threadId)) as TranscriptEntry[];
    setEntries(lines);
  }

  return (
    <div className="conversation-panel">
      <ul className="transcript">
        {entries.map((e) => (
          <li key={e.messageId} className={`msg msg-${e.author}`}>
            <strong>{e.author}:</strong> {e.text}
          </li>
        ))}
      </ul>
      <div className="composer">
        <textarea value={draft} onChange={(ev) => setDraft(ev.target.value)} rows={3} />
        <button onClick={send}>Send</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 在 thread-detail.tsx 嵌入 panel**

把左栏 `(Conversation panel — Task 19)` 替换成 `<ConversationPanel threadId={id} />`。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/web test
pnpm --filter @ai-employee/bot-runtime test -- events-api
git add packages/bot-runtime apps/web
git commit -m "feat(web): conversation panel with transcript and post message"
```

Expected: 全部 PASS。

---

### Task 20: Active task + Plan 面板（含 confirm 按钮）

**Files:**
- Create: `apps/web/src/components/task-plan-panel.tsx`
- Modify: `apps/web/src/pages/thread-detail.tsx`

- [ ] **Step 1: 写组件**

```tsx
// apps/web/src/components/task-plan-panel.tsx
import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type Task = { id: string; threadId: string; title: string; description: string; status: string };
type Plan = { id: string; objective: string; steps: Array<{ id: string; title: string; status: string }> };

export function TaskPlanPanel({ taskId, threadId }: { taskId: string; threadId: string }) {
  const { client } = useAppContext();
  const [task, setTask] = useState<Task | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);

  async function refresh() {
    const t = (await client.getTask(taskId)) as Task;
    setTask(t);
    try {
      const p = (await client.getPlan(taskId)) as Plan;
      setPlan(p);
    } catch {
      setPlan(null);
    }
  }
  useEffect(() => {
    refresh();
  }, [taskId]);

  async function onConfirm() {
    await client.confirmTask(taskId, { threadId, fromUserId: "u_client" });
    await refresh();
  }
  async function onCancel() {
    await client.cancelTask(taskId, { threadId, fromUserId: "u_client" });
    await refresh();
  }

  if (!task) return <div>Loading task...</div>;
  return (
    <div className="task-plan-panel">
      <h3>{task.title}</h3>
      <p className="status">[{task.status}]</p>
      <p>{task.description}</p>
      {task.status === "draft" && (
        <div className="actions">
          <button onClick={onConfirm}>Confirm</button>
          <button onClick={onCancel}>Cancel</button>
        </div>
      )}
      {plan && (
        <div className="plan">
          <h4>Plan: {plan.objective}</h4>
          <ol>
            {plan.steps.map((s) => (
              <li key={s.id}>
                {s.title} <em>[{s.status}]</em>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: thread-detail 嵌入**

把中栏改为：

```tsx
{tasks[0] ? <TaskPlanPanel taskId={tasks[0].id} threadId={id!} /> : <p>No task yet</p>}
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src
git commit -m "feat(web): task and plan panel with confirm/cancel actions"
```

---

### Task 21: Artifact 面板 + 内容查看

**Files:**
- Create: `apps/web/src/components/artifact-panel.tsx`
- Modify: `apps/web/src/pages/thread-detail.tsx`

- [ ] **Step 1: 写组件**

```tsx
// apps/web/src/components/artifact-panel.tsx
import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type Artifact = { name: string; sizeBytes: number; modifiedAt: string };

export function ArtifactPanel({ taskId, threadId }: { taskId: string; threadId: string }) {
  const { client } = useAppContext();
  const [list, setList] = useState<Artifact[]>([]);
  const [selected, setSelected] = useState<{ name: string; content: string } | null>(null);

  useEffect(() => {
    (async () => {
      const items = (await client.getArtifacts(taskId, threadId)) as Artifact[];
      setList(items);
    })();
  }, [taskId, threadId]);

  async function open(name: string) {
    const c = await client.getArtifact(taskId, threadId, name);
    setSelected({ name, content: typeof c === "string" ? c : JSON.stringify(c) });
  }

  return (
    <div className="artifact-panel">
      <h4>Artifacts</h4>
      <ul>
        {list.map((a) => (
          <li key={a.name}>
            <button onClick={() => open(a.name)}>{a.name}</button>{" "}
            <small>({a.sizeBytes} bytes)</small>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="artifact-viewer">
          <h5>{selected.name}</h5>
          <pre>{selected.content}</pre>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: thread-detail 嵌入右栏**

```tsx
{tasks[0] && <ArtifactPanel taskId={tasks[0].id} threadId={id!} />}
```

- [ ] **Step 3: commit**

```bash
git add apps/web/src
git commit -m "feat(web): artifact panel with content viewer"
```

---

### Task 22: SSE 实时刷新 + Channel 配置页

**Files:**
- Modify: `apps/web/src/pages/thread-detail.tsx`（SSE 收到 events 触发 refresh task/plan/transcript）
- Create: `apps/web/src/pages/channel-config.tsx`
- Modify: `apps/web/src/app.tsx`（加 `/channels` 路由 + nav 链接）

- [ ] **Step 1: thread-detail 接入 SSE 自动刷新**

```tsx
// 在 thread-detail.tsx
const { events } = useEventStream<{ id: string; kind: string }>({
  url: id ? `/api/threads/${id}/events?_token=${encodeURIComponent(adminToken)}` : "",
});
useEffect(() => {
  // any new event → re-fetch tasks
  if (events.length > 0 && id) {
    client.getTasks(id).then((ts) => setTasks(ts as TaskSummary[]));
  }
}, [events.length, id]);
```

- [ ] **Step 2: 写 channel-config 页**

```tsx
// apps/web/src/pages/channel-config.tsx
import { useEffect, useState } from "react";
import { useAppContext } from "../app-context.js";

type Sanitized = {
  provider: string;
  enabled: boolean;
  ingress: { webhookEnabled?: boolean; longConnectionEnabled?: boolean };
  publicFields: Record<string, string | boolean | number>;
  secrets: Record<string, { hasSecret: boolean }>;
};

export function ChannelConfig() {
  const { client } = useAppContext();
  const [list, setList] = useState<Sanitized[]>([]);
  const [draft, setDraft] = useState({
    appId: "",
    verificationToken: "",
    encryptKey: "",
    appSecret: "ref::FEISHU_APP_SECRET",
    webhookEnabled: true,
  });

  useEffect(() => {
    (async () => {
      setList(((await client.getChannels()) as Sanitized[]) ?? []);
    })();
  }, [client]);

  async function save() {
    await client.putChannel("feishu", {
      enabled: true,
      ingress: { webhookEnabled: draft.webhookEnabled },
      publicFields: {
        appId: draft.appId,
        verificationToken: draft.verificationToken,
        encryptKey: draft.encryptKey,
      },
      secretRefs: { appSecret: draft.appSecret },
    });
    setList(((await client.getChannels()) as Sanitized[]) ?? []);
  }

  return (
    <div className="channel-config">
      <h2>Channels</h2>
      <ul>
        {list.map((c) => (
          <li key={c.provider}>
            {c.provider} — {c.enabled ? "enabled" : "disabled"} — secrets:
            {Object.entries(c.secrets)
              .map(([k, v]) => `${k}=${v.hasSecret ? "✓" : "✗"}`)
              .join(", ")}
          </li>
        ))}
      </ul>
      <h3>Configure Feishu</h3>
      <label>
        App ID:
        <input value={draft.appId} onChange={(e) => setDraft({ ...draft, appId: e.target.value })} />
      </label>
      <label>
        Verification Token:
        <input
          value={draft.verificationToken}
          onChange={(e) => setDraft({ ...draft, verificationToken: e.target.value })}
        />
      </label>
      <label>
        Encrypt Key:
        <input
          value={draft.encryptKey}
          onChange={(e) => setDraft({ ...draft, encryptKey: e.target.value })}
        />
      </label>
      <label>
        App Secret Ref (env name with ref:: prefix):
        <input
          value={draft.appSecret}
          onChange={(e) => setDraft({ ...draft, appSecret: e.target.value })}
        />
      </label>
      <button onClick={save}>Save</button>
    </div>
  );
}
```

- [ ] **Step 3: app.tsx 路由 + nav**

```tsx
<header className="app-header">
  <Link to="/">Threads</Link>
  <Link to="/channels" style={{ marginLeft: 12 }}>Channels</Link>
  <TokenInput />
</header>
...
<Route path="/channels" element={<ChannelConfig />} />
```

- [ ] **Step 4: build + commit**

```bash
pnpm --filter @ai-employee/web build
git add apps/web/src
git commit -m "feat(web): SSE auto-refresh in thread detail + channel config page"
```

---

### Task 23: 前端 lint + 整体构建验证

**Files:**
- Modify: `biome.json`（apps/web 是否需要单独的 lint 配置）

- [ ] **Step 1: 跑 root lint**

```bash
pnpm lint
```

如果 biome 把 React JSX 当报错（`useExhaustiveDependencies` 等），按 Plan 1 风格的关闭策略：在 biome.json 加 override 给 apps/web/**：

```json
{
  "include": ["apps/web/**"],
  "linter": {
    "rules": {
      "correctness": { "useExhaustiveDependencies": "off" }
    }
  }
}
```

- [ ] **Step 2: 跑全量构建**

```bash
pnpm -r build
pnpm -r test
```

- [ ] **Step 3: commit lint 配置（如有）**

```bash
git add biome.json
git commit -m "chore: relax biome rules for apps/web React patterns"
```

---

## Phase E — Plan 1 follow-up cleanup（4 tasks）

### Task 24: Plan 1 follow-up #19 — channelType 收紧

**Files:**
- Modify: `packages/bot-runtime/src/storage/paths.ts`（type 改为 ProviderSchema 推断的 union）

- [ ] **Step 1: 修改 paths.ts**

把 `channelType: string` 全部改为 `channelType: import('../schema/channel.js').Provider`。需要 5 处签名调整。

- [ ] **Step 2: 跑测试 / build / lint**

如果别处有传 `string` 进来（webhook-handler / channel-binding-repo），它们已经用 ProviderSchema parse 过了，可以直接传。如果不行，加一个 cast。

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/src/storage
git commit -m "fix(paths): tighten channelType to Provider union (Plan 1 follow-up #19)"
```

---

### Task 25: Plan 1 follow-up #20 — paths.ts 全方法覆盖测试

**Files:**
- Create: `packages/bot-runtime/src/storage/__tests__/paths-coverage.test.ts`

枚举 `Paths` 接口的所有方法（约 31 个），用参数化的 `it.each([...])` 跑一遍，断言：
1. 返回的字符串非空
2. 包含 `runtimeId`
3. 不含 `..`
4. 跟其他方法不冲突

- [ ] **Step 1: 写参数化测试**

```ts
// packages/bot-runtime/src/storage/__tests__/paths-coverage.test.ts
import { describe, expect, it } from "vitest";
import { createPaths, type Paths } from "../paths.js";

const RT = "rt_x";
const TH = "th_y";
const TK = "tk_z";
const PR = "feishu";
const ARGS: Array<[keyof Paths, unknown[]]> = [
  ["state", [RT]],
  ["lock", [RT]],
  ["runtimeInfo", [RT]],
  ["thread", [RT, TH]],
  ["transcript", [RT, TH]],
  ["task", [RT, TH, TK]],
  ["plan", [RT, TH, TK]],
  ["events", [RT, TH, TK]],
  ["control", [RT, TH, TK]],
  ["channelConfig", [RT, PR]],
  ["binding", [RT, TH, PR, "bd_a"]],
  ["chatClaim", [RT, PR, "oc_x"]],
  ["webhookEvent", [RT, PR, "ev_a"]],
  // ... 其余方法补全 (从 paths.ts 实际签名映)
];

describe("paths.ts coverage", () => {
  it.each(ARGS)("%s returns non-empty path containing runtimeId", (method, args) => {
    const p = createPaths("/tmp/data");
    const fn = (p as unknown as Record<string, (...a: unknown[]) => string>)[method];
    expect(typeof fn).toBe("function");
    const result = fn(...args);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain(RT);
    expect(result).not.toContain("..");
  });
});
```

注：实际 31 个方法全列出来。开始时先 `grep "^\s*[a-z]" paths.ts` 拿全方法名。

- [ ] **Step 2: 跑 → 全 PASS**

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/src/storage/__tests__
git commit -m "test(paths): full method coverage parameterized test (Plan 1 follow-up #20)"
```

---

### Task 26: Plan 1 follow-up #21 — update_plan 直写路径测试

**Files:**
- Create: `packages/bot-runtime/src/tools/__tests__/update-plan-direct-write.test.ts`

测试 `update_plan` 工具的直写分支（带 `paths/runtimeId` 注入时，跳过 plan repo 直接写到 plan json 的路径）。

- [ ] **Step 1: 看 update-plan.ts 的直写分支签名**

`grep -n "directWrite\|paths\|runtimeId" packages/bot-runtime/src/tools/update-plan.ts`

按实际分支构造测试。

- [ ] **Step 2: 写测试 → 跑**

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/src/tools/__tests__
git commit -m "test(update-plan): cover direct-write path (Plan 1 follow-up #21)"
```

---

### Task 27: Plan 1 follow-up #22 — critical-node 5 matcher 全覆盖

**Files:**
- Modify: `packages/bot-runtime/src/executor/__tests__/critical-node-policy.test.ts`

补 3 种 matcher 的测试：external_io / budget_overflow / out_of_scope。

- [ ] **Step 1: 写新测试**

```ts
it("external_io matcher hits when tool call has direction=outbound", async () => {
  const evaluator = createCriticalNodeEvaluator([
    { id: "p_eo", scope: "global", matcher: { kind: "external_io", direction: "outbound" }, action: "require_approval", ownerUserId: "u_a", enabled: true, createdAt: "2026-04-29T01:00:00Z" },
  ]);
  const hit = evaluator.evaluate({ tool: "notify_bound_channel", args: {}, externalIo: { direction: "outbound" } });
  expect(hit?.action).toBe("require_approval");
});

it("budget_overflow matcher fires when budget dim exceeded", async () => {
  // ...
});

it("out_of_scope matcher fires for action outside current revision", async () => {
  // ...
});
```

具体 evaluate 签名按现有实现调整。

- [ ] **Step 2: 跑 → 全 PASS**

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime/src/executor/__tests__
git commit -m "test(critical-node): cover external_io / budget_overflow / out_of_scope matchers (Plan 1 follow-up #22)"
```

---

## Phase F — 端到端 + 全量验证（3 tasks）

### Task 28: 端到端测试：客户端 → API → SSE

**Files:**
- Create: `apps/web/src/__tests__/e2e-smoke.test.tsx`（仅前端 hook + 后端 mock 拼起来跑通 happy path）

实际 e2e 跑真 HybridHost + 浏览器太重，v1 只做前端 + mock api 的 smoke。

- [ ] **Step 1: 写测试**

mock createApiClient 返回固定数据，渲染 ThreadList + ThreadDetail，手工触发 events，断言 task 列表更新。

- [ ] **Step 2: 跑 + commit**

```bash
git add apps/web/src/__tests__
git commit -m "test(web): e2e smoke for thread list → detail → SSE-driven refresh"
```

---

### Task 29: 全量验证

- [ ] **Step 1: 跑所有 test**

```bash
pnpm -r test
```

Expected: bot-runtime 258+（Plan 1+2 基线 + Plan 3 新增） + web ~10 = 全 PASS。

- [ ] **Step 2: 跑所有 build**

```bash
pnpm -r build
```

Expected: 0 errors。

- [ ] **Step 3: lint**

```bash
pnpm lint
```

Expected: 0 errors。

- [ ] **Step 4: commit clean state**

```bash
git status
git commit -am "chore: pass full test/build/lint pipeline (Plan 3)" || true
```

---

### Task 30: Plan 3 自查 + Execution Handoff

- [ ] **Step 1: 自查报告填到本 plan 文档**

按 Plan 2 模板填：Spec 覆盖表 / 占位符扫描 / 类型一致性 / 最终验证。

- [ ] **Step 2: Execution Handoff 章节**

- [ ] **Step 3: 写"后续 Plan 预告"指向 Plan 4**

- [ ] **Step 4: commit**

```bash
git add docs/superpowers/plans/2026-04-29-client-visualization-plan.md
git commit -m "docs(plan-3): self-review report and execution handoff"
```

---

## 全量验证

- [ ] 测试：`pnpm -r test` —— 全 PASS
- [ ] 构建：`pnpm -r build` —— 0 errors
- [ ] Lint：`pnpm lint` —— 0 errors
- [ ] 自查表格已回填本文档
- [ ] HEAD 在 `plan-3-client` 分支
- [ ] Plan 1 follow-up #19/#20/#21/#22 已清掉

---

## Plan 3 自查报告

（执行 Task 30 时填写）

---

## Execution Handoff

（执行 Task 30 时填写）

---

## 后续 Plan 预告

- Plan 4：Agent eval + v1 验收 e2e（Spec 第 17 章 #9-#10），覆盖 200 条 MessageGuard eval / 50 条 TaskConfirmation eval / 30 条 PlanRevision eval，外加完整 12 条 v1 验收 e2e 自动化。
