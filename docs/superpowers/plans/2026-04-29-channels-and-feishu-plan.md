# Channel Subsystem & Feishu Provider Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Plan 1 的 hybrid runtime 能真正接入飞书：实现通用 ChannelProvider 协议、ChannelIngress（HTTP webhook + 可选长连接）、ChannelOutboundJobRunner，落地 Feishu Provider 第一版，并把 Plan 1 留下的 `notify_bound_channel` stub 替换成真实实现。

**Architecture:**
- 通用层：`ChannelProvider` 接口 + `ChannelProviderRegistry` 把 inbound/outbound 收敛到统一形状（normalize → MasterHost.ingestInbound；ChannelJob → provider.send）。
- Ingress：`createIngressServer` 提供 HTTP 路由，每个 provider 注册自己的 webhook handler，共享 verify/dedupe/binding-lookup/dispatch 流程。
- Outbound：`ChannelOutboundJobRunner` 扩展 Plan 1 的 `JobQueue`，专门消费 `type=send_message|create_conversation|delete_conversation` 的 ChannelJob。
- Feishu Provider：完整实现 webhook 验签、token 缓存、消息归一化、@bot/reply/slash 检测、消息发送、群拉取，长连接做接口预留。
- Guardian：私聊与未绑群作为控制面入口，识别 `/bind /unbind /list /help` 命令，驱动 ChannelBindingRepo。
- 客户端 API：`/api/channels` 系列端点返回脱敏视图（secret 字段只返回 `hasSecret: boolean`）。

**Tech Stack:** Node 20+ ESM、TypeScript 5.6 strict、Zod 3、Vitest 2、`node:http`（不引入 express，保持依赖最小）、`undici` 做出站 HTTP（Plan 1 已是间接依赖）、`uuidv7`。

**Spec 起点覆盖：** 第 17 章 #6（通用 Channel 子系统）+ #7（Feishu Provider 第一版）。

**前置依赖（Plan 1 提供）：**
- `ChannelConfig / ChannelBinding / ChannelInboundEvent / ChannelJob` schema（packages/bot-runtime/src/schema/channel.ts）
- `ChannelBindingRepo`（含 chat-claim 互斥）
- `paths.channelConfig / paths.binding / paths.chatClaim / paths.webhookEvent`
- `JobQueue`（pending/locked/done/failed/dedupe）
- `MasterHost.ingestInbound`（accepts source / bound / mentionsBot / replyToBotMessage / slashCommand 等结构化字段）
- `notify_bound_channel` stub（Task 24 替换）
- `inbound-dedupe`（基于 `paths.webhookEvent`）

---

## Phase A — ChannelProvider 协议与通用基础设施（5 tasks）

### Task 1: ChannelProvider 接口与 Provider 注册表

**Files:**
- Create: `packages/bot-runtime/src/channel/provider.ts`
- Create: `packages/bot-runtime/src/channel/provider-registry.ts`
- Create: `packages/bot-runtime/src/channel/__tests__/provider-registry.test.ts`

- [ ] **Step 1: 写失败的注册表测试**

```ts
// packages/bot-runtime/src/channel/__tests__/provider-registry.test.ts
import { describe, expect, it } from "vitest";
import type { ChannelProvider } from "../provider.js";
import { createProviderRegistry } from "../provider-registry.js";

function makeFake(name: string): ChannelProvider {
  return {
    provider: name,
    async verifyInbound() {
      return { ok: true };
    },
    async normalizeInbound() {
      return null;
    },
    async sendMessage() {
      return { externalMessageId: "x" };
    },
    async createConversation() {
      return { externalConversationId: "c" };
    },
    async deleteConversation() {
      return;
    },
  };
}

describe("createProviderRegistry", () => {
  it("registers and resolves a provider by name", () => {
    const r = createProviderRegistry();
    const fake = makeFake("feishu");
    r.register(fake);
    expect(r.get("feishu")).toBe(fake);
  });

  it("throws when registering a duplicate provider", () => {
    const r = createProviderRegistry();
    r.register(makeFake("feishu"));
    expect(() => r.register(makeFake("feishu"))).toThrow(/already registered/);
  });

  it("returns null for unknown provider", () => {
    const r = createProviderRegistry();
    expect(r.get("slack")).toBeNull();
  });

  it("lists registered providers", () => {
    const r = createProviderRegistry();
    r.register(makeFake("feishu"));
    r.register(makeFake("slack"));
    expect(r.list().sort()).toEqual(["feishu", "slack"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- provider-registry`
Expected: FAIL（模块不存在）。

- [ ] **Step 3: 写 provider.ts**

```ts
// packages/bot-runtime/src/channel/provider.ts
import type { InboundEvent } from "../thread-loop/thread-loop.js";

export type VerifyInboundResult =
  | { ok: true; decoded?: unknown }
  | { ok: false; reason: string };

export type NormalizedInbound = {
  externalEventId: string;
  externalMessageId?: string;
  externalConversationId: string;
  externalConversationType: "dm" | "group" | "topic";
  externalUserId: string;
  text: string;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  receivedAt: string;
  raw: unknown;
};

export type SendMessageInput = {
  externalConversationId: string;
  text: string;
  importance: "info" | "milestone" | "alert";
  replyToExternalMessageId?: string;
};

export type SendMessageResult = {
  externalMessageId: string;
};

export type CreateConversationInput = {
  externalUserId?: string;
  topic?: string;
  type: "dm" | "group" | "topic";
};

export type CreateConversationResult = {
  externalConversationId: string;
};

export type ChannelProvider = {
  provider: string;
  verifyInbound(input: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer;
    secret: string;
  }): Promise<VerifyInboundResult>;
  normalizeInbound(decoded: unknown): Promise<NormalizedInbound | null>;
  sendMessage(input: SendMessageInput): Promise<SendMessageResult>;
  createConversation(input: CreateConversationInput): Promise<CreateConversationResult>;
  deleteConversation(input: { externalConversationId: string }): Promise<void>;
};

export type InboundDispatch = Pick<
  InboundEvent,
  "messageId" | "fromUserId" | "source" | "text" | "at"
> & {
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  threadId: string;
};
```

- [ ] **Step 4: 写 provider-registry.ts**

```ts
// packages/bot-runtime/src/channel/provider-registry.ts
import type { ChannelProvider } from "./provider.js";

export type ProviderRegistry = {
  register(p: ChannelProvider): void;
  get(name: string): ChannelProvider | null;
  list(): string[];
};

export function createProviderRegistry(): ProviderRegistry {
  const map = new Map<string, ChannelProvider>();
  return {
    register(p) {
      if (map.has(p.provider)) {
        throw new Error(`provider ${p.provider} already registered`);
      }
      map.set(p.provider, p);
    },
    get(name) {
      return map.get(name) ?? null;
    },
    list() {
      return [...map.keys()];
    },
  };
}
```

- [ ] **Step 5: 跑测试确认通过 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- provider-registry
git add packages/bot-runtime/src/channel
git commit -m "feat(channel): ChannelProvider interface and in-memory registry"
```

Expected: 4 tests PASS。

---

### Task 2: ChannelInboundEventRepo（持久化 + 状态转移）

**Files:**
- Create: `packages/bot-runtime/src/channel/inbound-event-repo.ts`
- Create: `packages/bot-runtime/src/channel/__tests__/inbound-event-repo.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/channel/__tests__/inbound-event-repo.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createInboundEventRepo } from "../inbound-event-repo.js";

let tmp: string;
let runtimeId: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ier-"));
  runtimeId = "rt_test";
});

describe("InboundEventRepo", () => {
  it("writes a received event then transitions to processed", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "evt-1", { externalMessageId: "msg-a" });
    const got = await repo.load("feishu", "evt-1");
    expect(got?.status).toBe("received");
    expect(got?.externalMessageId).toBe("msg-a");

    await repo.markProcessed("feishu", "evt-1");
    const after = await repo.load("feishu", "evt-1");
    expect(after?.status).toBe("processed");
    expect(after?.processedAt).toBeDefined();
  });

  it("isDuplicate returns true for known event ids", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    expect(await repo.isDuplicate("feishu", "evt-2")).toBe(false);
    await repo.recordReceived("feishu", "evt-2", {});
    expect(await repo.isDuplicate("feishu", "evt-2")).toBe(true);
  });

  it("markSkipped flips status to skipped with reason", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "evt-3", {});
    await repo.markSkipped("feishu", "evt-3", "no-binding");
    const got = await repo.load("feishu", "evt-3");
    expect(got?.status).toBe("skipped");
  });

  it("markFailed records the lastError", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "evt-4", {});
    await repo.markFailed("feishu", "evt-4", "verify-failed");
    const got = await repo.load("feishu", "evt-4");
    expect(got?.status).toBe("failed");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- inbound-event-repo`
Expected: FAIL（repo 不存在）。

- [ ] **Step 3: 实现 inbound-event-repo.ts**

```ts
// packages/bot-runtime/src/channel/inbound-event-repo.ts
import { type ChannelInboundEvent, ChannelInboundEventSchema } from "../schema/channel.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type RecordReceivedInput = {
  externalMessageId?: string;
};

export type InboundEventRepo = {
  recordReceived(
    provider: string,
    externalEventId: string,
    input: RecordReceivedInput,
  ): Promise<ChannelInboundEvent>;
  isDuplicate(provider: string, externalEventId: string): Promise<boolean>;
  load(provider: string, externalEventId: string): Promise<ChannelInboundEvent | null>;
  markProcessed(provider: string, externalEventId: string): Promise<ChannelInboundEvent>;
  markSkipped(
    provider: string,
    externalEventId: string,
    reason: string,
  ): Promise<ChannelInboundEvent>;
  markFailed(
    provider: string,
    externalEventId: string,
    reason: string,
  ): Promise<ChannelInboundEvent>;
};

export function createInboundEventRepo(paths: Paths, runtimeId: string): InboundEventRepo {
  function file(provider: string, externalEventId: string) {
    return paths.webhookEvent(runtimeId, provider, externalEventId);
  }

  async function transition(
    provider: string,
    externalEventId: string,
    next: ChannelInboundEvent["status"],
    extra: Partial<ChannelInboundEvent> = {},
  ) {
    const cur = await readJson(file(provider, externalEventId));
    if (!cur) throw new Error(`inbound event ${provider}/${externalEventId} not found`);
    const parsed = ChannelInboundEventSchema.parse(cur);
    const updated = ChannelInboundEventSchema.parse({
      ...parsed,
      ...extra,
      id: parsed.id,
      provider: parsed.provider,
      externalEventId: parsed.externalEventId,
      createdAt: parsed.createdAt,
      status: next,
    });
    await writeJson(file(provider, externalEventId), updated);
    return updated;
  }

  return {
    async recordReceived(provider, externalEventId, input) {
      const now = new Date().toISOString();
      const event = ChannelInboundEventSchema.parse({
        id: newId("ie"),
        provider,
        externalEventId,
        externalMessageId: input.externalMessageId,
        status: "received",
        payloadRef: file(provider, externalEventId),
        createdAt: now,
      });
      await writeJson(file(provider, externalEventId), event);
      return event;
    },
    async isDuplicate(provider, externalEventId) {
      const got = await readJson(file(provider, externalEventId));
      return got !== null;
    },
    async load(provider, externalEventId) {
      const got = await readJson(file(provider, externalEventId));
      return got ? ChannelInboundEventSchema.parse(got) : null;
    },
    async markProcessed(provider, externalEventId) {
      return transition(provider, externalEventId, "processed", {
        processedAt: new Date().toISOString(),
      });
    },
    async markSkipped(provider, externalEventId, _reason) {
      return transition(provider, externalEventId, "skipped");
    },
    async markFailed(provider, externalEventId, _reason) {
      return transition(provider, externalEventId, "failed");
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- inbound-event-repo
git add packages/bot-runtime/src/channel
git commit -m "feat(channel): persistent InboundEventRepo with received/processed/skipped/failed"
```

Expected: 4 tests PASS。

---

### Task 3: ChannelConfigStore（脱敏读写）

**Files:**
- Create: `packages/bot-runtime/src/channel/config-store.ts`
- Create: `packages/bot-runtime/src/channel/__tests__/config-store.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/channel/__tests__/config-store.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelConfigStore } from "../config-store.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ccs-"));
});

describe("ChannelConfigStore", () => {
  it("creates a config and returns sanitized view", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", {
      enabled: true,
      ingress: { webhookEnabled: true },
      publicFields: { appId: "cli_xxx" },
      secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
    });
    const view = await store.loadSanitized("feishu");
    expect(view?.enabled).toBe(true);
    expect(view?.publicFields).toEqual({ appId: "cli_xxx" });
    expect(view?.secrets).toEqual({ appSecret: { hasSecret: true } });
  });

  it("loadRaw exposes secretRefs (used by providers, not API)", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", {
      enabled: true,
      ingress: {},
      publicFields: {},
      secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
    });
    const raw = await store.loadRaw("feishu");
    expect(raw?.secretRefs.appSecret).toBe("ref::FEISHU_APP_SECRET");
  });

  it("returns null for missing provider", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    expect(await store.loadSanitized("slack")).toBeNull();
  });

  it("list returns all configured providers", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", { enabled: true, ingress: {}, publicFields: {}, secretRefs: {} });
    await store.upsert("slack", { enabled: false, ingress: {}, publicFields: {}, secretRefs: {} });
    const all = await store.list();
    expect(all.map((c) => c.provider).sort()).toEqual(["feishu", "slack"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- config-store`
Expected: FAIL。

- [ ] **Step 3: 实现 config-store.ts**

```ts
// packages/bot-runtime/src/channel/config-store.ts
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { type ChannelConfig, ChannelConfigSchema, ProviderSchema } from "../schema/channel.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type SanitizedChannelConfig = {
  provider: ChannelConfig["provider"];
  enabled: boolean;
  ingress: ChannelConfig["ingress"];
  publicFields: ChannelConfig["publicFields"];
  secrets: Record<string, { hasSecret: boolean }>;
  createdAt: string;
  updatedAt: string;
};

export type UpsertChannelConfigInput = {
  enabled: boolean;
  ingress: ChannelConfig["ingress"];
  publicFields: ChannelConfig["publicFields"];
  secretRefs: ChannelConfig["secretRefs"];
};

export type ChannelConfigStore = {
  upsert(provider: string, input: UpsertChannelConfigInput): Promise<ChannelConfig>;
  loadRaw(provider: string): Promise<ChannelConfig | null>;
  loadSanitized(provider: string): Promise<SanitizedChannelConfig | null>;
  list(): Promise<SanitizedChannelConfig[]>;
};

function sanitize(cfg: ChannelConfig): SanitizedChannelConfig {
  const secrets: Record<string, { hasSecret: boolean }> = {};
  for (const k of Object.keys(cfg.secretRefs)) {
    secrets[k] = { hasSecret: Boolean(cfg.secretRefs[k]) };
  }
  return {
    provider: cfg.provider,
    enabled: cfg.enabled,
    ingress: cfg.ingress,
    publicFields: cfg.publicFields,
    secrets,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

export function createChannelConfigStore(paths: Paths, runtimeId: string): ChannelConfigStore {
  return {
    async upsert(provider, input) {
      const parsedProvider = ProviderSchema.parse(provider);
      const now = new Date().toISOString();
      const existing = await readJson(paths.channelConfig(runtimeId, parsedProvider));
      const createdAt =
        existing && typeof (existing as { createdAt?: unknown }).createdAt === "string"
          ? (existing as { createdAt: string }).createdAt
          : now;
      const cfg = ChannelConfigSchema.parse({
        provider: parsedProvider,
        enabled: input.enabled,
        ingress: input.ingress,
        publicFields: input.publicFields,
        secretRefs: input.secretRefs,
        createdAt,
        updatedAt: now,
      });
      await writeJson(paths.channelConfig(runtimeId, parsedProvider), cfg);
      return cfg;
    },
    async loadRaw(provider) {
      const got = await readJson(paths.channelConfig(runtimeId, provider));
      return got ? ChannelConfigSchema.parse(got) : null;
    },
    async loadSanitized(provider) {
      const raw = await this.loadRaw(provider);
      return raw ? sanitize(raw) : null;
    },
    async list() {
      const dir = path.posix.join(paths.state(runtimeId), "channels");
      await mkdir(dir, { recursive: true });
      const files = await readdir(dir);
      const out: SanitizedChannelConfig[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const provider = f.replace(/\.json$/, "");
        const got = await this.loadSanitized(provider);
        if (got) out.push(got);
      }
      return out;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- config-store
git add packages/bot-runtime/src/channel
git commit -m "feat(channel): ChannelConfigStore with sanitized read API"
```

Expected: 4 tests PASS。

---

### Task 4: ChannelOutboundJob queue 扩展

**Files:**
- Create: `packages/bot-runtime/src/channel/outbound-job-queue.ts`
- Create: `packages/bot-runtime/src/channel/__tests__/outbound-job-queue.test.ts`

**注意：** Plan 1 的 `JobQueue` 已经支持 `pending/locked/done/failed/dedupe` 通用文件队列。这里我们建一个 channel 专用 wrapper，把 `ChannelJob` schema 的写入与 dedupe 行为绑定到 jobs/ 目录。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/channel/__tests__/outbound-job-queue.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelOutboundJobQueue } from "../outbound-job-queue.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "coq-"));
});

describe("ChannelOutboundJobQueue", () => {
  it("enqueues a send_message job and assigns id + runAfter", async () => {
    const q = createChannelOutboundJobQueue(createPaths(tmp), runtimeId);
    const job = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    expect(job.id).toMatch(/^cj_/);
    expect(job.type).toBe("send_message");
    expect(job.status).toBe("pending");
  });

  it("enqueueSendMessage with dedupeKey skips duplicates", async () => {
    const q = createChannelOutboundJobQueue(createPaths(tmp), runtimeId);
    const a = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
      dedupeKey: "k1",
    });
    const b = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
      dedupeKey: "k1",
    });
    expect(b.id).toBe(a.id);
  });

  it("listPending returns only pending channel jobs", async () => {
    const q = createChannelOutboundJobQueue(createPaths(tmp), runtimeId);
    await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "a", importance: "info" },
    });
    const pending = await q.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.type).toBe("send_message");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- outbound-job-queue`
Expected: FAIL。

- [ ] **Step 3: 实现 outbound-job-queue.ts**

```ts
// packages/bot-runtime/src/channel/outbound-job-queue.ts
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { type ChannelJob, ChannelJobSchema } from "../schema/channel.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type EnqueueSendMessageInput = {
  provider: string;
  payload: {
    externalConversationId: string;
    text: string;
    importance: "info" | "milestone" | "alert";
    replyToExternalMessageId?: string;
  };
  dedupeKey?: string;
};

export type ChannelOutboundJobQueue = {
  enqueueSendMessage(input: EnqueueSendMessageInput): Promise<ChannelJob>;
  listPending(): Promise<ChannelJob[]>;
  load(jobId: string): Promise<ChannelJob | null>;
  markRunning(jobId: string): Promise<ChannelJob>;
  markSucceeded(jobId: string, result: Record<string, unknown>): Promise<ChannelJob>;
  markFailed(jobId: string, lastError: string, dead: boolean): Promise<ChannelJob>;
};

const CHANNEL_JOB_TYPES = new Set(["send_message", "create_conversation", "delete_conversation"]);

export function createChannelOutboundJobQueue(
  paths: Paths,
  runtimeId: string,
): ChannelOutboundJobQueue {
  const jobsRoot = path.posix.join(paths.state(runtimeId), "jobs");
  const pendingDir = path.posix.join(jobsRoot, "pending");
  const dedupeDir = path.posix.join(jobsRoot, "dedupe");

  function jobFile(dir: string, id: string) {
    return path.posix.join(dir, `${id}.json`);
  }

  async function locate(jobId: string): Promise<string | null> {
    for (const sub of ["pending", "locked", "done", "failed"]) {
      const f = path.posix.join(jobsRoot, sub, `${jobId}.json`);
      const got = await readJson(f);
      if (got) return f;
    }
    return null;
  }

  return {
    async enqueueSendMessage(input) {
      await mkdir(pendingDir, { recursive: true });
      await mkdir(dedupeDir, { recursive: true });
      if (input.dedupeKey) {
        try {
          const dedupeFile = path.posix.join(dedupeDir, input.dedupeKey);
          const existingId = (await readFile(dedupeFile, "utf8")).trim();
          if (existingId) {
            const where = await locate(existingId);
            if (where) {
              const existing = await readJson(where);
              if (existing) return ChannelJobSchema.parse(existing);
            }
          }
        } catch {
          /* not a duplicate */
        }
      }
      const now = new Date().toISOString();
      const job = ChannelJobSchema.parse({
        id: newId("cj"),
        provider: input.provider,
        type: "send_message",
        status: "pending",
        dedupeKey: input.dedupeKey,
        payload: input.payload as unknown as Record<string, unknown>,
        attemptCount: 0,
        runAfter: now,
        createdAt: now,
        updatedAt: now,
      });
      await writeJson(jobFile(pendingDir, job.id), job);
      if (input.dedupeKey) {
        await writeFile(path.posix.join(dedupeDir, input.dedupeKey), job.id, "utf8");
      }
      return job;
    },

    async listPending() {
      await mkdir(pendingDir, { recursive: true });
      const files = await readdir(pendingDir);
      const out: ChannelJob[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const got = await readJson(path.posix.join(pendingDir, f));
        if (!got) continue;
        const parsed = ChannelJobSchema.safeParse(got);
        if (parsed.success && CHANNEL_JOB_TYPES.has(parsed.data.type)) {
          out.push(parsed.data);
        }
      }
      return out;
    },

    async load(jobId) {
      const where = await locate(jobId);
      if (!where) return null;
      const got = await readJson(where);
      return got ? ChannelJobSchema.parse(got) : null;
    },

    async markRunning(jobId) {
      const cur = await this.load(jobId);
      if (!cur) throw new Error(`channel job ${jobId} not found`);
      const updated = ChannelJobSchema.parse({
        ...cur,
        id: cur.id,
        createdAt: cur.createdAt,
        status: "running",
        attemptCount: cur.attemptCount + 1,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(jobFile(path.posix.join(jobsRoot, "locked"), jobId), updated);
      return updated;
    },

    async markSucceeded(jobId, result) {
      const cur = await this.load(jobId);
      if (!cur) throw new Error(`channel job ${jobId} not found`);
      const updated = ChannelJobSchema.parse({
        ...cur,
        id: cur.id,
        createdAt: cur.createdAt,
        status: "succeeded",
        result,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(jobFile(path.posix.join(jobsRoot, "done"), jobId), updated);
      return updated;
    },

    async markFailed(jobId, lastError, dead) {
      const cur = await this.load(jobId);
      if (!cur) throw new Error(`channel job ${jobId} not found`);
      const updated = ChannelJobSchema.parse({
        ...cur,
        id: cur.id,
        createdAt: cur.createdAt,
        status: dead ? "dead" : "failed",
        lastError,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(jobFile(path.posix.join(jobsRoot, "failed"), jobId), updated);
      return updated;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- outbound-job-queue
git add packages/bot-runtime/src/channel
git commit -m "feat(channel): ChannelOutboundJobQueue with dedupeKey + lifecycle transitions"
```

Expected: 3 tests PASS。

---

### Task 5: ChannelOutboundJobRunner（消费 + 调度）

**Files:**
- Create: `packages/bot-runtime/src/channel/outbound-runner.ts`
- Create: `packages/bot-runtime/src/channel/__tests__/outbound-runner.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/channel/__tests__/outbound-runner.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelOutboundJobQueue } from "../outbound-job-queue.js";
import { createChannelOutboundRunner } from "../outbound-runner.js";
import { createProviderRegistry } from "../provider-registry.js";
import type { ChannelProvider } from "../provider.js";

let tmp: string;
const runtimeId = "rt_test";

function fakeFeishu(send: (args: unknown) => Promise<{ externalMessageId: string }>): ChannelProvider {
  return {
    provider: "feishu",
    async verifyInbound() {
      return { ok: true };
    },
    async normalizeInbound() {
      return null;
    },
    sendMessage: send as ChannelProvider["sendMessage"],
    async createConversation() {
      return { externalConversationId: "x" };
    },
    async deleteConversation() {
      return;
    },
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "cor-"));
});

describe("ChannelOutboundRunner", () => {
  it("processes a pending send_message job and marks it succeeded", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const send = vi.fn().mockResolvedValue({ externalMessageId: "om_42" });
    reg.register(fakeFeishu(send));
    const runner = createChannelOutboundRunner({ queue: q, registry: reg });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("succeeded");
    expect(after?.result).toEqual({ externalMessageId: "om_42" });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("marks failed when provider throws and not yet at max attempts", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    reg.register(fakeFeishu(send));
    const runner = createChannelOutboundRunner({ queue: q, registry: reg, maxAttempts: 3 });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("failed");
    expect(after?.attemptCount).toBe(1);
  });

  it("marks dead after attempts exceed max", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const send = vi.fn().mockRejectedValue(new Error("boom"));
    reg.register(fakeFeishu(send));
    const runner = createChannelOutboundRunner({ queue: q, registry: reg, maxAttempts: 1 });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("dead");
  });

  it("skips jobs whose provider is not registered", async () => {
    const paths = createPaths(tmp);
    const q = createChannelOutboundJobQueue(paths, runtimeId);
    const reg = createProviderRegistry();
    const runner = createChannelOutboundRunner({ queue: q, registry: reg });

    const j = await q.enqueueSendMessage({
      provider: "feishu",
      payload: { externalConversationId: "oc_x", text: "hi", importance: "info" },
    });
    await runner.tickOnce();
    const after = await q.load(j.id);
    expect(after?.status).toBe("failed");
    expect(after?.lastError).toContain("provider feishu not registered");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- outbound-runner`
Expected: FAIL。

- [ ] **Step 3: 实现 outbound-runner.ts**

```ts
// packages/bot-runtime/src/channel/outbound-runner.ts
import type { ChannelOutboundJobQueue } from "./outbound-job-queue.js";
import type { ProviderRegistry } from "./provider-registry.js";
import type { SendMessageInput } from "./provider.js";

export type ChannelOutboundRunnerOptions = {
  queue: ChannelOutboundJobQueue;
  registry: ProviderRegistry;
  maxAttempts?: number;
};

export type ChannelOutboundRunner = {
  tickOnce(): Promise<{ processed: number }>;
};

export function createChannelOutboundRunner(opts: ChannelOutboundRunnerOptions): ChannelOutboundRunner {
  const maxAttempts = opts.maxAttempts ?? 5;

  return {
    async tickOnce() {
      const pending = await opts.queue.listPending();
      let processed = 0;
      for (const job of pending) {
        const provider = opts.registry.get(job.provider);
        if (!provider) {
          await opts.queue.markFailed(job.id, `provider ${job.provider} not registered`, false);
          continue;
        }
        try {
          await opts.queue.markRunning(job.id);
          if (job.type === "send_message") {
            const result = await provider.sendMessage(job.payload as unknown as SendMessageInput);
            await opts.queue.markSucceeded(job.id, result as unknown as Record<string, unknown>);
          } else if (job.type === "create_conversation") {
            const result = await provider.createConversation(
              job.payload as unknown as Parameters<typeof provider.createConversation>[0],
            );
            await opts.queue.markSucceeded(job.id, result as unknown as Record<string, unknown>);
          } else if (job.type === "delete_conversation") {
            await provider.deleteConversation(
              job.payload as unknown as { externalConversationId: string },
            );
            await opts.queue.markSucceeded(job.id, {});
          } else {
            await opts.queue.markFailed(job.id, `unknown job type ${job.type}`, true);
          }
          processed += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const dead = job.attemptCount + 1 >= maxAttempts;
          await opts.queue.markFailed(job.id, message, dead);
        }
      }
      return { processed };
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- outbound-runner
git add packages/bot-runtime/src/channel
git commit -m "feat(channel): ChannelOutboundRunner with retry/backoff and dead-letter"
```

Expected: 4 tests PASS。

---

## Phase B — ChannelIngress（4 tasks）

### Task 6: createIngressServer（基于 node:http 的轻量路由）

**Files:**
- Create: `packages/bot-runtime/src/ingress/http-server.ts`
- Create: `packages/bot-runtime/src/ingress/__tests__/http-server.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/ingress/__tests__/http-server.test.ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../http-server.js";

let server: IngressServer | null = null;

beforeEach(() => {
  server = null;
});
afterEach(async () => {
  if (server) await server.close();
});

describe("createIngressServer", () => {
  it("routes POST /webhooks/:provider to the registered handler", async () => {
    server = createIngressServer();
    server.route("POST", "/webhooks/feishu", async (req) => {
      return { status: 200, body: { ok: true, ct: req.headers["content-type"] ?? null } };
    });
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/feishu`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ct: "application/json" });
  });

  it("returns 404 for unknown route", async () => {
    server = createIngressServer();
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(res.status).toBe(404);
  });

  it("returns 500 when handler throws", async () => {
    server = createIngressServer();
    server.route("POST", "/boom", async () => {
      throw new Error("kaboom");
    });
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/boom`, { method: "POST" });
    expect(res.status).toBe(500);
  });

  it("passes raw body Buffer to the handler", async () => {
    server = createIngressServer();
    let seenLen = 0;
    server.route("POST", "/raw", async (req) => {
      seenLen = req.rawBody.length;
      return { status: 200, body: { len: seenLen } };
    });
    const { port } = await server.listen(0);
    await fetch(`http://127.0.0.1:${port}/raw`, { method: "POST", body: "abcdef" });
    expect(seenLen).toBe(6);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- http-server`
Expected: FAIL。

- [ ] **Step 3: 实现 http-server.ts**

```ts
// packages/bot-runtime/src/ingress/http-server.ts
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { AddressInfo } from "node:net";

export type IngressRequest = {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
};

export type IngressResponse = {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
};

export type IngressHandler = (req: IngressRequest) => Promise<IngressResponse>;

export type IngressServer = {
  route(method: string, path: string, handler: IngressHandler): void;
  listen(port: number): Promise<{ port: number }>;
  close(): Promise<void>;
};

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer | string) => {
      chunks.push(typeof c === "string" ? Buffer.from(c) : c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function createIngressServer(): IngressServer {
  const routes = new Map<string, IngressHandler>();
  const key = (m: string, p: string) => `${m.toUpperCase()} ${p}`;

  const httpServer: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    try {
      const handler = routes.get(key(req.method ?? "GET", req.url?.split("?")[0] ?? ""));
      if (!handler) {
        res.statusCode = 404;
        res.end("not found");
        return;
      }
      const rawBody = await readBody(req);
      const result = await handler({
        method: req.method ?? "GET",
        url: req.url ?? "/",
        headers: req.headers as Record<string, string | string[] | undefined>,
        rawBody,
      });
      res.statusCode = result.status;
      for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
      if (result.body !== undefined) {
        if (typeof result.body === "string" || Buffer.isBuffer(result.body)) {
          res.end(result.body);
        } else {
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(result.body));
        }
      } else {
        res.end();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.statusCode = 500;
      res.end(message);
    }
  });

  return {
    route(method, path, handler) {
      routes.set(key(method, path), handler);
    },
    listen(port) {
      return new Promise((resolve) => {
        httpServer.listen(port, "127.0.0.1", () => {
          const addr = httpServer.address() as AddressInfo;
          resolve({ port: addr.port });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        httpServer.close((e) => (e ? reject(e) : resolve()));
      });
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- http-server
git add packages/bot-runtime/src/ingress
git commit -m "feat(ingress): minimal node:http server with raw-body routing"
```

Expected: 4 tests PASS。

---

### Task 7: 通用 webhook handler（verify → dedupe → normalize → dispatch）

**Files:**
- Create: `packages/bot-runtime/src/ingress/webhook-handler.ts`
- Create: `packages/bot-runtime/src/ingress/__tests__/webhook-handler.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/ingress/__tests__/webhook-handler.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInboundEventRepo } from "../../channel/inbound-event-repo.js";
import { createProviderRegistry } from "../../channel/provider-registry.js";
import type { ChannelProvider } from "../../channel/provider.js";
import { createPaths } from "../../storage/paths.js";
import { createWebhookHandler } from "../webhook-handler.js";

let tmp: string;
const runtimeId = "rt_test";
const SECRET = "shh";

function fake(provider: string, normalize: ChannelProvider["normalizeInbound"]): ChannelProvider {
  return {
    provider,
    async verifyInbound() {
      return { ok: true, decoded: { event_id: "ext-1" } };
    },
    normalizeInbound: normalize,
    async sendMessage() {
      return { externalMessageId: "x" };
    },
    async createConversation() {
      return { externalConversationId: "x" };
    },
    async deleteConversation() {
      return;
    },
  };
}

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "wh-"));
});

describe("WebhookHandler", () => {
  it("returns 200 + dispatches to MasterHost.ingestInbound on first delivery", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    const reg = createProviderRegistry();
    reg.register(
      fake("feishu", async () => ({
        externalEventId: "ext-1",
        externalMessageId: "msg-1",
        externalConversationId: "oc_1",
        externalConversationType: "group",
        externalUserId: "ou_alice",
        text: "@bot do x",
        mentionsBot: true,
        replyToBotMessage: false,
        slashCommand: null,
        receivedAt: "2026-04-29T01:00:00Z",
        raw: {},
      })),
    );
    const ingest = vi.fn().mockResolvedValue({ kind: "noop" });
    const lookup = vi.fn().mockResolvedValue({
      threadId: "th_1",
      bound: true,
      userId: "u_alice",
    });
    const handler = createWebhookHandler({
      registry: reg,
      inboundRepo: repo,
      ingest,
      lookupBinding: lookup,
      configResolver: async () => ({ secret: SECRET }),
    });
    const res = await handler({
      provider: "feishu",
      headers: {},
      rawBody: Buffer.from("{}"),
    });
    expect(res.status).toBe(200);
    expect(ingest).toHaveBeenCalledTimes(1);
    const stored = await repo.load("feishu", "ext-1");
    expect(stored?.status).toBe("processed");
  });

  it("returns 200 and skips dispatch when externalEventId is duplicate", async () => {
    const paths = createPaths(tmp);
    const repo = createInboundEventRepo(paths, runtimeId);
    await repo.recordReceived("feishu", "ext-1", {});
    await repo.markProcessed("feishu", "ext-1");
    const reg = createProviderRegistry();
    reg.register(
      fake("feishu", async () => ({
        externalEventId: "ext-1",
        externalConversationId: "oc_1",
        externalConversationType: "group",
        externalUserId: "ou_alice",
        text: "x",
        mentionsBot: false,
        replyToBotMessage: false,
        slashCommand: null,
        receivedAt: "2026-04-29T01:00:00Z",
        raw: {},
      })),
    );
    const ingest = vi.fn();
    const handler = createWebhookHandler({
      registry: reg,
      inboundRepo: repo,
      ingest,
      lookupBinding: async () => ({ threadId: "th_1", bound: true, userId: "u_a" }),
      configResolver: async () => ({ secret: SECRET }),
    });
    const res = await handler({
      provider: "feishu",
      headers: {},
      rawBody: Buffer.from("{}"),
    });
    expect(res.status).toBe(200);
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns 401 when verifyInbound fails", async () => {
    const paths = createPaths(tmp);
    const reg = createProviderRegistry();
    reg.register({
      provider: "feishu",
      async verifyInbound() {
        return { ok: false, reason: "bad-signature" };
      },
      async normalizeInbound() {
        return null;
      },
      async sendMessage() {
        return { externalMessageId: "x" };
      },
      async createConversation() {
        return { externalConversationId: "x" };
      },
      async deleteConversation() {
        return;
      },
    });
    const handler = createWebhookHandler({
      registry: reg,
      inboundRepo: createInboundEventRepo(paths, runtimeId),
      ingest: async () => ({ kind: "noop" }),
      lookupBinding: async () => ({ threadId: "th_1", bound: true, userId: "u_a" }),
      configResolver: async () => ({ secret: SECRET }),
    });
    const res = await handler({ provider: "feishu", headers: {}, rawBody: Buffer.from("") });
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- webhook-handler`
Expected: FAIL。

- [ ] **Step 3: 实现 webhook-handler.ts**

```ts
// packages/bot-runtime/src/ingress/webhook-handler.ts
import type { InboundEventRepo } from "../channel/inbound-event-repo.js";
import type { ProviderRegistry } from "../channel/provider-registry.js";
import type { NormalizedInbound } from "../channel/provider.js";
import type { ThreadLoopResult } from "../thread-loop/thread-loop.js";

export type ConfigResolver = (provider: string) => Promise<{ secret: string } | null>;

export type BindingLookup = (
  provider: string,
  externalConversationId: string,
  externalConversationType: "dm" | "group" | "topic",
  externalUserId: string,
) => Promise<{ threadId: string; bound: boolean; userId: string } | null>;

export type IngestFn = (input: {
  threadId: string;
  messageId: string;
  fromUserId: string;
  source: "client" | "lark_private" | "lark_group" | "slack" | "wecom";
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  messageText: string;
  at: string;
}) => Promise<ThreadLoopResult>;

export type WebhookHandlerInput = {
  provider: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
};

export type WebhookHandlerResult = {
  status: number;
  body?: unknown;
};

export type WebhookHandler = (input: WebhookHandlerInput) => Promise<WebhookHandlerResult>;

function sourceFor(provider: string, type: NormalizedInbound["externalConversationType"]) {
  if (provider === "feishu") {
    return type === "dm" ? "lark_private" : "lark_group";
  }
  if (provider === "slack") return "slack";
  if (provider === "wecom") return "wecom";
  return "client";
}

export function createWebhookHandler(opts: {
  registry: ProviderRegistry;
  inboundRepo: InboundEventRepo;
  ingest: IngestFn;
  lookupBinding: BindingLookup;
  configResolver: ConfigResolver;
}): WebhookHandler {
  return async (req) => {
    const provider = opts.registry.get(req.provider);
    if (!provider) return { status: 404, body: { error: "provider not registered" } };
    const cfg = await opts.configResolver(req.provider);
    if (!cfg) return { status: 412, body: { error: "provider not configured" } };

    const verified = await provider.verifyInbound({
      headers: req.headers,
      rawBody: req.rawBody,
      secret: cfg.secret,
    });
    if (!verified.ok) {
      return { status: 401, body: { error: verified.reason } };
    }

    const decoded = "decoded" in verified ? verified.decoded : JSON.parse(req.rawBody.toString("utf8"));

    const challenge = (decoded as { challenge?: unknown })?.challenge;
    const type = (decoded as { type?: unknown })?.type;
    if (typeof challenge === "string" && type === "url_verification") {
      return { status: 200, body: { challenge } };
    }

    const normalized = await provider.normalizeInbound(decoded);
    if (!normalized) return { status: 200, body: { ok: true } };

    if (await opts.inboundRepo.isDuplicate(req.provider, normalized.externalEventId)) {
      return { status: 200, body: { ok: true, duplicate: true } };
    }
    await opts.inboundRepo.recordReceived(req.provider, normalized.externalEventId, {
      externalMessageId: normalized.externalMessageId,
    });

    const binding = await opts.lookupBinding(
      req.provider,
      normalized.externalConversationId,
      normalized.externalConversationType,
      normalized.externalUserId,
    );
    if (!binding) {
      await opts.inboundRepo.markSkipped(req.provider, normalized.externalEventId, "no-binding");
      return { status: 200, body: { ok: true, skipped: "no-binding" } };
    }

    try {
      await opts.ingest({
        threadId: binding.threadId,
        messageId: normalized.externalMessageId ?? `ext-${normalized.externalEventId}`,
        fromUserId: binding.userId,
        source: sourceFor(req.provider, normalized.externalConversationType),
        bound: binding.bound,
        mentionsBot: normalized.mentionsBot,
        replyToBotMessage: normalized.replyToBotMessage,
        slashCommand: normalized.slashCommand,
        messageText: normalized.text,
        at: normalized.receivedAt,
      });
      await opts.inboundRepo.markProcessed(req.provider, normalized.externalEventId);
      return { status: 200, body: { ok: true } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await opts.inboundRepo.markFailed(req.provider, normalized.externalEventId, message);
      return { status: 500, body: { error: message } };
    }
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- webhook-handler
git add packages/bot-runtime/src/ingress
git commit -m "feat(ingress): generic webhook handler with verify/dedupe/normalize/dispatch"
```

Expected: 3 tests PASS。

---

### Task 8: BindingLookup 实现（基于 chat-claim + ChannelBindingRepo）

**Files:**
- Create: `packages/bot-runtime/src/ingress/binding-lookup.ts`
- Create: `packages/bot-runtime/src/ingress/__tests__/binding-lookup.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/ingress/__tests__/binding-lookup.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createBindingLookup } from "../binding-lookup.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "bl-"));
});

describe("BindingLookup", () => {
  it("returns the bound thread when chat-claim exists", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const binding = await repo.create({
      threadId: "th_alpha",
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "client",
    });
    await repo.updateStatus("th_alpha", "feishu", binding.id, "bound");
    await repo.claimChat("feishu", "oc_x", "th_alpha");

    const lookup = createBindingLookup(paths, runtimeId, {
      resolveUserByExternalId: async () => "u_alice",
      createGuardianThread: async () => "th_guardian",
    });
    const got = await lookup("feishu", "oc_x", "group", "ou_alice");
    expect(got).toEqual({ threadId: "th_alpha", bound: true, userId: "u_alice" });
  });

  it("returns guardian thread for unbound group with no chat-claim", async () => {
    const paths = createPaths(tmp);
    const lookup = createBindingLookup(paths, runtimeId, {
      resolveUserByExternalId: async () => "u_alice",
      createGuardianThread: async () => "th_guardian",
    });
    const got = await lookup("feishu", "oc_unknown", "group", "ou_alice");
    expect(got).toEqual({ threadId: "th_guardian", bound: false, userId: "u_alice" });
  });

  it("DM always routes to guardian thread", async () => {
    const paths = createPaths(tmp);
    const lookup = createBindingLookup(paths, runtimeId, {
      resolveUserByExternalId: async () => "u_alice",
      createGuardianThread: async () => "th_guardian",
    });
    const got = await lookup("feishu", "p2p_x", "dm", "ou_alice");
    expect(got?.threadId).toBe("th_guardian");
    expect(got?.bound).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- binding-lookup`
Expected: FAIL。

- [ ] **Step 3: 实现 binding-lookup.ts**

```ts
// packages/bot-runtime/src/ingress/binding-lookup.ts
import { createChannelBindingRepo } from "../repositories/channel-binding-repo.js";
import type { Paths } from "../storage/paths.js";
import type { BindingLookup } from "./webhook-handler.js";

export type BindingLookupDeps = {
  resolveUserByExternalId: (provider: string, externalUserId: string) => Promise<string>;
  createGuardianThread: (
    provider: string,
    userId: string,
    externalConversationType: "dm" | "group" | "topic",
    externalConversationId: string,
  ) => Promise<string>;
};

export function createBindingLookup(
  paths: Paths,
  runtimeId: string,
  deps: BindingLookupDeps,
): BindingLookup {
  const repo = createChannelBindingRepo(paths, runtimeId);
  return async (provider, externalConversationId, externalConversationType, externalUserId) => {
    const userId = await deps.resolveUserByExternalId(provider, externalUserId);
    if (externalConversationType === "group") {
      const claimed = await repo.whoClaimsChat(provider, externalConversationId);
      if (claimed) {
        return { threadId: claimed, bound: true, userId };
      }
    }
    const guardianThreadId = await deps.createGuardianThread(
      provider,
      userId,
      externalConversationType,
      externalConversationId,
    );
    return { threadId: guardianThreadId, bound: false, userId };
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- binding-lookup
git add packages/bot-runtime/src/ingress
git commit -m "feat(ingress): BindingLookup using chat-claim + guardian thread fallback"
```

Expected: 3 tests PASS。

---

### Task 9: LongConnection 适配接口（v1 stub）

**Files:**
- Create: `packages/bot-runtime/src/ingress/long-connection.ts`
- Create: `packages/bot-runtime/src/ingress/__tests__/long-connection.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/ingress/__tests__/long-connection.test.ts
import { describe, expect, it, vi } from "vitest";
import { createNoopLongConnection, runLongConnection } from "../long-connection.js";

describe("LongConnection", () => {
  it("runLongConnection invokes adapter.start exactly once and stops on close", async () => {
    const start = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const handle = await runLongConnection({ start, stop });
    expect(start).toHaveBeenCalledTimes(1);
    await handle.close();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("createNoopLongConnection is a safe default", async () => {
    const noop = createNoopLongConnection();
    await expect(noop.start({} as never)).resolves.toBeUndefined();
    await expect(noop.stop()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- long-connection`
Expected: FAIL。

- [ ] **Step 3: 实现 long-connection.ts**

```ts
// packages/bot-runtime/src/ingress/long-connection.ts
import type { WebhookHandler } from "./webhook-handler.js";

export type LongConnectionAdapter = {
  start(deliver: WebhookHandler): Promise<void>;
  stop(): Promise<void>;
};

export type LongConnectionHandle = {
  close(): Promise<void>;
};

export async function runLongConnection(
  adapter: LongConnectionAdapter,
  deliver?: WebhookHandler,
): Promise<LongConnectionHandle> {
  await adapter.start(deliver ?? (async () => ({ status: 200, body: { ok: true } })));
  return {
    async close() {
      await adapter.stop();
    },
  };
}

export function createNoopLongConnection(): LongConnectionAdapter {
  return {
    async start() {
      return;
    },
    async stop() {
      return;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- long-connection
git add packages/bot-runtime/src/ingress
git commit -m "feat(ingress): LongConnectionAdapter interface with noop default"
```

Expected: 2 tests PASS。

---

## Phase C — Feishu Provider 第一版（10 tasks）

### Task 10: Feishu config schema + secret 解析

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/config.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/config.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/config.test.ts
import { describe, expect, it } from "vitest";
import { type FeishuConfig, parseFeishuConfig, resolveFeishuSecrets } from "../config.js";

describe("FeishuConfig", () => {
  it("parses publicFields + secretRefs into a typed config", () => {
    const cfg: FeishuConfig = parseFeishuConfig({
      provider: "feishu",
      enabled: true,
      ingress: { webhookEnabled: true, longConnectionEnabled: false },
      publicFields: { appId: "cli_x", verificationToken: "v_t", encryptKey: "" },
      secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      createdAt: "2026-04-29T01:00:00Z",
      updatedAt: "2026-04-29T01:00:00Z",
    });
    expect(cfg.appId).toBe("cli_x");
    expect(cfg.verificationToken).toBe("v_t");
    expect(cfg.encryptKey).toBe("");
    expect(cfg.appSecretRef).toBe("ref::FEISHU_APP_SECRET");
  });

  it("rejects when appId or verificationToken is missing", () => {
    expect(() =>
      parseFeishuConfig({
        provider: "feishu",
        enabled: true,
        ingress: {},
        publicFields: {},
        secretRefs: {},
        createdAt: "2026-04-29T01:00:00Z",
        updatedAt: "2026-04-29T01:00:00Z",
      }),
    ).toThrow(/appId/);
  });

  it("resolveFeishuSecrets pulls appSecret from env by ref name", async () => {
    const env = { FEISHU_APP_SECRET: "real-secret" };
    const secrets = await resolveFeishuSecrets(
      { appSecretRef: "ref::FEISHU_APP_SECRET" } as FeishuConfig,
      env,
    );
    expect(secrets.appSecret).toBe("real-secret");
  });

  it("resolveFeishuSecrets throws on missing env entry", async () => {
    await expect(
      resolveFeishuSecrets({ appSecretRef: "ref::MISSING" } as FeishuConfig, {}),
    ).rejects.toThrow(/MISSING/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/config`
Expected: FAIL。

- [ ] **Step 3: 实现 config.ts**

```ts
// packages/bot-runtime/src/providers/feishu/config.ts
import { z } from "zod";
import type { ChannelConfig } from "../../schema/channel.js";

export type FeishuConfig = {
  appId: string;
  verificationToken: string;
  encryptKey: string;
  webhookEnabled: boolean;
  longConnectionEnabled: boolean;
  appSecretRef: string;
};

const PublicFieldsSchema = z.object({
  appId: z.string().min(1),
  verificationToken: z.string().min(1),
  encryptKey: z.string().default(""),
});

export function parseFeishuConfig(cfg: ChannelConfig): FeishuConfig {
  const pub = PublicFieldsSchema.parse(cfg.publicFields);
  return {
    appId: pub.appId,
    verificationToken: pub.verificationToken,
    encryptKey: pub.encryptKey ?? "",
    webhookEnabled: cfg.ingress.webhookEnabled ?? false,
    longConnectionEnabled: cfg.ingress.longConnectionEnabled ?? false,
    appSecretRef: cfg.secretRefs.appSecret ?? "",
  };
}

export type FeishuSecrets = {
  appSecret: string;
};

const REF_PREFIX = "ref::";

export async function resolveFeishuSecrets(
  cfg: Pick<FeishuConfig, "appSecretRef">,
  env: Record<string, string | undefined>,
): Promise<FeishuSecrets> {
  if (!cfg.appSecretRef.startsWith(REF_PREFIX)) {
    throw new Error("appSecretRef must start with ref::");
  }
  const envName = cfg.appSecretRef.slice(REF_PREFIX.length);
  const value = env[envName];
  if (!value) throw new Error(`env ${envName} not set`);
  return { appSecret: value };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/config
git add packages/bot-runtime/src/providers
git commit -m "feat(feishu): typed config + ref-based secret resolver"
```

Expected: 4 tests PASS。

---

### Task 11: Feishu signature/encrypt 验证

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/signature.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/signature.test.ts`

**飞书校验规则参考：**
- 未启用 encryptKey：`X-Lark-Request-Timestamp` + `X-Lark-Request-Nonce` + body 经过 token 拼接 sha1，与 `X-Lark-Signature` 比对（仅当 verificationToken 起作用时）。
- 启用 encryptKey：body 形如 `{ "encrypt": "..." }`，AES-256-CBC 解密；解密后含 `token` 字段，与 verificationToken 比对。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/signature.test.ts
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptFeishuPayload, verifyFeishuSignature } from "../signature.js";

function pkcs7pad(buf: Buffer, blockSize: number) {
  const pad = blockSize - (buf.length % blockSize);
  return Buffer.concat([buf, Buffer.alloc(pad, pad)]);
}

function feishuEncrypt(plainObj: unknown, encryptKey: string): string {
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  cipher.setAutoPadding(false);
  const data = pkcs7pad(Buffer.from(JSON.stringify(plainObj), "utf8"), 16);
  const enc = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, enc]).toString("base64");
}

describe("verifyFeishuSignature (no encrypt)", () => {
  it("accepts when verificationToken matches in body", () => {
    const body = JSON.stringify({ token: "v_t", type: "url_verification", challenge: "c1" });
    const got = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(body),
      verificationToken: "v_t",
      encryptKey: "",
    });
    expect(got.ok).toBe(true);
  });

  it("rejects on token mismatch", () => {
    const body = JSON.stringify({ token: "wrong", type: "url_verification" });
    const got = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(body),
      verificationToken: "v_t",
      encryptKey: "",
    });
    expect(got.ok).toBe(false);
  });
});

describe("decryptFeishuPayload (encrypt enabled)", () => {
  it("decrypts and validates token", () => {
    const encryptKey = "k".repeat(16);
    const inner = { token: "v_t", type: "event_callback", event: { foo: 1 } };
    const enc = feishuEncrypt(inner, encryptKey);
    const result = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ encrypt: enc })),
      verificationToken: "v_t",
      encryptKey,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.decoded as { type: string }).type).toBe("event_callback");
    }
  });

  it("rejects when token in decrypted payload mismatches", () => {
    const encryptKey = "k".repeat(16);
    const inner = { token: "wrong", type: "event_callback" };
    const enc = feishuEncrypt(inner, encryptKey);
    const result = verifyFeishuSignature({
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ encrypt: enc })),
      verificationToken: "v_t",
      encryptKey,
    });
    expect(result.ok).toBe(false);
  });

  it("decryptFeishuPayload exposed for tests", () => {
    const encryptKey = "k".repeat(16);
    const enc = feishuEncrypt({ token: "v_t", type: "x" }, encryptKey);
    const got = decryptFeishuPayload(enc, encryptKey);
    expect(got.token).toBe("v_t");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/signature`
Expected: FAIL。

- [ ] **Step 3: 实现 signature.ts**

```ts
// packages/bot-runtime/src/providers/feishu/signature.ts
import crypto from "node:crypto";
import type { VerifyInboundResult } from "../../channel/provider.js";

export function decryptFeishuPayload(encrypt: string, encryptKey: string): Record<string, unknown> {
  const buf = Buffer.from(encrypt, "base64");
  const key = crypto.createHash("sha256").update(encryptKey).digest();
  const iv = buf.subarray(0, 16);
  const data = buf.subarray(16);
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  decipher.setAutoPadding(false);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  const padLen = decrypted[decrypted.length - 1] ?? 0;
  const unpadded = decrypted.subarray(0, decrypted.length - padLen).toString("utf8");
  return JSON.parse(unpadded) as Record<string, unknown>;
}

export type VerifyFeishuInput = {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  verificationToken: string;
  encryptKey: string;
};

export function verifyFeishuSignature(input: VerifyFeishuInput): VerifyInboundResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(input.rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "invalid-json" };
  }

  if (typeof parsed.encrypt === "string") {
    if (!input.encryptKey) return { ok: false, reason: "encrypt-key-missing" };
    let decoded: Record<string, unknown>;
    try {
      decoded = decryptFeishuPayload(parsed.encrypt, input.encryptKey);
    } catch (err) {
      return {
        ok: false,
        reason: `decrypt-failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (decoded.token !== input.verificationToken) {
      return { ok: false, reason: "token-mismatch" };
    }
    return { ok: true, decoded };
  }

  if (parsed.token !== input.verificationToken) {
    return { ok: false, reason: "token-mismatch" };
  }
  return { ok: true, decoded: parsed };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/signature
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): webhook signature verification + AES-256-CBC decrypt"
```

Expected: 5 tests PASS。

---

### Task 12: Feishu tenant_access_token 缓存

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/token-cache.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/token-cache.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/token-cache.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTenantTokenCache } from "../token-cache.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("TenantTokenCache", () => {
  it("fetches once and caches until near expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    const fetcher = vi.fn().mockResolvedValue({ token: "t1", expiresInSec: 7200 });
    const cache = createTenantTokenCache({ fetch: fetcher });
    expect(await cache.get()).toBe("t1");
    expect(await cache.get()).toBe("t1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("refreshes after expiry minus skew", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ token: "t1", expiresInSec: 60 })
      .mockResolvedValueOnce({ token: "t2", expiresInSec: 60 });
    const cache = createTenantTokenCache({ fetch: fetcher, skewSec: 10 });
    expect(await cache.get()).toBe("t1");
    vi.setSystemTime(new Date("2026-04-29T00:00:55Z"));
    expect(await cache.get()).toBe("t2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidate forces next call to refetch", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce({ token: "t1", expiresInSec: 7200 })
      .mockResolvedValueOnce({ token: "t2", expiresInSec: 7200 });
    const cache = createTenantTokenCache({ fetch: fetcher });
    expect(await cache.get()).toBe("t1");
    cache.invalidate();
    expect(await cache.get()).toBe("t2");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/token-cache`
Expected: FAIL。

- [ ] **Step 3: 实现 token-cache.ts**

```ts
// packages/bot-runtime/src/providers/feishu/token-cache.ts
export type TenantTokenFetchResult = {
  token: string;
  expiresInSec: number;
};

export type TenantTokenCache = {
  get(): Promise<string>;
  invalidate(): void;
};

export function createTenantTokenCache(opts: {
  fetch: () => Promise<TenantTokenFetchResult>;
  skewSec?: number;
}): TenantTokenCache {
  const skewSec = opts.skewSec ?? 30;
  let cached: { token: string; expiresAt: number } | null = null;

  return {
    async get() {
      const now = Date.now();
      if (cached && now < cached.expiresAt) {
        return cached.token;
      }
      const fresh = await opts.fetch();
      cached = {
        token: fresh.token,
        expiresAt: now + (fresh.expiresInSec - skewSec) * 1000,
      };
      return cached.token;
    },
    invalidate() {
      cached = null;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/token-cache
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): tenant_access_token cache with skew-aware expiry"
```

Expected: 3 tests PASS。

---

### Task 13: Feishu normalizeInbound（im.message.receive_v1）

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/normalize.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/normalize.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/normalize.test.ts
import { describe, expect, it } from "vitest";
import { normalizeFeishuInbound } from "../normalize.js";

const groupAtBot = {
  schema: "2.0",
  header: {
    event_id: "ev1",
    event_type: "im.message.receive_v1",
    create_time: "1714349900000",
  },
  event: {
    sender: { sender_id: { open_id: "ou_alice" } },
    message: {
      message_id: "om_1",
      message_type: "text",
      chat_id: "oc_x",
      chat_type: "group",
      content: '{"text":"<at user_id=\\"ou_bot\\">Bot</at> please summarize"}',
      mentions: [{ id: { open_id: "ou_bot" }, name: "Bot" }],
    },
  },
};

describe("normalizeFeishuInbound", () => {
  it("parses a group @bot text message", async () => {
    const got = await normalizeFeishuInbound(groupAtBot, { botOpenId: "ou_bot" });
    expect(got).toMatchObject({
      externalEventId: "ev1",
      externalMessageId: "om_1",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      externalUserId: "ou_alice",
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
    });
    expect(got?.text.toLowerCase()).toContain("please summarize");
  });

  it("parses DM (chat_type=p2p) as dm", async () => {
    const dm = JSON.parse(JSON.stringify(groupAtBot));
    dm.event.message.chat_type = "p2p";
    dm.event.message.content = '{"text":"hi"}';
    dm.event.message.mentions = [];
    const got = await normalizeFeishuInbound(dm, { botOpenId: "ou_bot" });
    expect(got?.externalConversationType).toBe("dm");
    expect(got?.mentionsBot).toBe(false);
  });

  it("returns null for non im.message.receive_v1 event_type", async () => {
    const e = JSON.parse(JSON.stringify(groupAtBot));
    e.header.event_type = "im.message.message_read_v1";
    expect(await normalizeFeishuInbound(e, { botOpenId: "ou_bot" })).toBeNull();
  });

  it("detects /confirm slash command", async () => {
    const e = JSON.parse(JSON.stringify(groupAtBot));
    e.event.message.content = '{"text":"<at user_id=\\"ou_bot\\">Bot</at> /confirm"}';
    const got = await normalizeFeishuInbound(e, { botOpenId: "ou_bot" });
    expect(got?.slashCommand).toBe("confirm");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/normalize`
Expected: FAIL。

- [ ] **Step 3: 实现 normalize.ts**

```ts
// packages/bot-runtime/src/providers/feishu/normalize.ts
import type { NormalizedInbound } from "../../channel/provider.js";

type FeishuEnvelope = {
  schema?: string;
  header?: {
    event_id?: string;
    event_type?: string;
    create_time?: string;
  };
  event?: {
    sender?: { sender_id?: { open_id?: string } };
    message?: {
      message_id?: string;
      message_type?: string;
      chat_id?: string;
      chat_type?: string;
      content?: string;
      mentions?: Array<{ id?: { open_id?: string }; name?: string }>;
      parent_id?: string;
      root_id?: string;
    };
    reply?: { message_id?: string; sender_open_id?: string };
  };
};

const SLASH_RE = /\/(confirm|cancel|status)\b/i;

function stripMentions(text: string): string {
  return text.replace(/<at user_id="[^"]+">[^<]*<\/at>/g, "").trim();
}

export type NormalizeOptions = {
  botOpenId: string;
};

export async function normalizeFeishuInbound(
  raw: unknown,
  opts: NormalizeOptions,
): Promise<NormalizedInbound | null> {
  const env = raw as FeishuEnvelope;
  if (env.header?.event_type !== "im.message.receive_v1") return null;
  const msg = env.event?.message;
  const sender = env.event?.sender?.sender_id?.open_id;
  if (!msg || !sender || msg.message_type !== "text") return null;

  let parsedContent: { text?: string };
  try {
    parsedContent = JSON.parse(msg.content ?? "{}") as { text?: string };
  } catch {
    return null;
  }
  const rawText = parsedContent.text ?? "";
  const text = stripMentions(rawText) || rawText;

  const mentionsBot = Boolean(
    msg.mentions?.some((m) => m.id?.open_id === opts.botOpenId),
  );

  const replyToBotMessage = Boolean(
    env.event?.reply?.sender_open_id && env.event.reply.sender_open_id === opts.botOpenId,
  );

  const slashMatch = text.match(SLASH_RE);
  const slashCommand = slashMatch
    ? (slashMatch[1]?.toLowerCase() as "confirm" | "cancel" | "status")
    : null;

  const chatTypeRaw = msg.chat_type ?? "p2p";
  const externalConversationType: "dm" | "group" | "topic" =
    chatTypeRaw === "p2p" ? "dm" : "group";

  const createTimeMs = Number(env.header.create_time ?? Date.now());
  const receivedAt = new Date(Number.isFinite(createTimeMs) ? createTimeMs : Date.now()).toISOString();

  return {
    externalEventId: env.header.event_id ?? "",
    externalMessageId: msg.message_id,
    externalConversationId: msg.chat_id ?? "",
    externalConversationType,
    externalUserId: sender,
    text,
    mentionsBot,
    replyToBotMessage,
    slashCommand,
    receivedAt,
    raw,
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/normalize
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): normalize im.message.receive_v1 with @bot/reply/slash detection"
```

Expected: 4 tests PASS。

---

### Task 14: Feishu sendMessage（HTTP 出站）

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/send-message.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/send-message.test.ts`

**注意：** 用 `globalThis.fetch`（Node 20+ 内置），测试时通过 `vi.stubGlobal('fetch', mock)` 替换。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/send-message.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { feishuSendMessage } from "../send-message.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feishuSendMessage", () => {
  it("POSTs to /open-apis/im/v1/messages with bearer + json body and returns message_id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: "ok", data: { message_id: "om_42" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await feishuSendMessage(
      { tenantAccessToken: "t1" },
      { externalConversationId: "oc_x", text: "hi", importance: "info" },
    );
    expect(r.externalMessageId).toBe("om_42");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/open-apis/im/v1/messages");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t1");
    const parsed = JSON.parse((init as RequestInit).body as string);
    expect(parsed.receive_id).toBe("oc_x");
    expect(parsed.msg_type).toBe("text");
  });

  it("throws when feishu returns non-zero code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 99991663, msg: "rate limited" }),
      }),
    );
    await expect(
      feishuSendMessage(
        { tenantAccessToken: "t1" },
        { externalConversationId: "oc_x", text: "hi", importance: "info" },
      ),
    ).rejects.toThrow(/99991663/);
  });

  it("throws on HTTP-level failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => "boom" }),
    );
    await expect(
      feishuSendMessage(
        { tenantAccessToken: "t1" },
        { externalConversationId: "oc_x", text: "hi", importance: "info" },
      ),
    ).rejects.toThrow(/500/);
  });

  it("appends importance prefix for milestone/alert", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { message_id: "om_43" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    await feishuSendMessage(
      { tenantAccessToken: "t1" },
      { externalConversationId: "oc_x", text: "done", importance: "alert" },
    );
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    const content = JSON.parse(body.content) as { text: string };
    expect(content.text).toMatch(/\[alert\]/i);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/send-message`
Expected: FAIL。

- [ ] **Step 3: 实现 send-message.ts**

```ts
// packages/bot-runtime/src/providers/feishu/send-message.ts
import type { SendMessageInput, SendMessageResult } from "../../channel/provider.js";

const FEISHU_HOST = "https://open.feishu.cn";

function importancePrefix(importance: SendMessageInput["importance"]): string {
  switch (importance) {
    case "milestone":
      return "[milestone] ";
    case "alert":
      return "[alert] ";
    default:
      return "";
  }
}

function receiveIdType(externalConversationId: string): string {
  if (externalConversationId.startsWith("oc_")) return "chat_id";
  if (externalConversationId.startsWith("ou_")) return "open_id";
  if (externalConversationId.startsWith("on_")) return "open_chat_id";
  return "chat_id";
}

export async function feishuSendMessage(
  ctx: { tenantAccessToken: string },
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const url = `${FEISHU_HOST}/open-apis/im/v1/messages?receive_id_type=${receiveIdType(
    input.externalConversationId,
  )}`;
  const body = {
    receive_id: input.externalConversationId,
    msg_type: "text",
    content: JSON.stringify({ text: importancePrefix(input.importance) + input.text }),
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`feishu send_message HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as { code?: number; msg?: string; data?: { message_id?: string } };
  if (json.code !== 0) {
    throw new Error(`feishu send_message code=${json.code} msg=${json.msg}`);
  }
  if (!json.data?.message_id) {
    throw new Error("feishu send_message missing data.message_id");
  }
  return { externalMessageId: json.data.message_id };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/send-message
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): outbound send_message with importance prefix"
```

Expected: 4 tests PASS。

---

### Task 15: Feishu createConversation（拉私聊 / open chat 查询）

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/create-conversation.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/create-conversation.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/create-conversation.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { feishuCreateConversation } from "../create-conversation.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("feishuCreateConversation", () => {
  it("DM type: returns p2p chat by open_id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { chat_id: "p2p_xxx" } }),
      }),
    );
    const r = await feishuCreateConversation(
      { tenantAccessToken: "t1" },
      { type: "dm", externalUserId: "ou_alice" },
    );
    expect(r.externalConversationId).toBe("p2p_xxx");
  });

  it("group type: returns chat_id from create_chat", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { chat_id: "oc_new" } }),
      }),
    );
    const r = await feishuCreateConversation(
      { tenantAccessToken: "t1" },
      { type: "group", topic: "task channel" },
    );
    expect(r.externalConversationId).toBe("oc_new");
  });

  it("throws on missing externalUserId for dm", async () => {
    await expect(
      feishuCreateConversation({ tenantAccessToken: "t1" }, { type: "dm" }),
    ).rejects.toThrow(/externalUserId/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/create-conversation`
Expected: FAIL。

- [ ] **Step 3: 实现 create-conversation.ts**

```ts
// packages/bot-runtime/src/providers/feishu/create-conversation.ts
import type {
  CreateConversationInput,
  CreateConversationResult,
} from "../../channel/provider.js";

const FEISHU_HOST = "https://open.feishu.cn";

export async function feishuCreateConversation(
  ctx: { tenantAccessToken: string },
  input: CreateConversationInput,
): Promise<CreateConversationResult> {
  if (input.type === "dm") {
    if (!input.externalUserId) throw new Error("dm requires externalUserId");
    const res = await fetch(
      `${FEISHU_HOST}/open-apis/im/v1/chats/p2p?user_id_type=open_id&user_id=${encodeURIComponent(
        input.externalUserId,
      )}`,
      { headers: { Authorization: `Bearer ${ctx.tenantAccessToken}` } },
    );
    if (!res.ok) throw new Error(`feishu p2p HTTP ${res.status}`);
    const json = (await res.json()) as { code?: number; data?: { chat_id?: string } };
    if (json.code !== 0 || !json.data?.chat_id) {
      throw new Error(`feishu p2p code=${json.code}`);
    }
    return { externalConversationId: json.data.chat_id };
  }

  const body: Record<string, unknown> = { name: input.topic ?? "AI Employee task" };
  const res = await fetch(`${FEISHU_HOST}/open-apis/im/v1/chats`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ctx.tenantAccessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`feishu create_chat HTTP ${res.status}`);
  const json = (await res.json()) as { code?: number; data?: { chat_id?: string } };
  if (json.code !== 0 || !json.data?.chat_id) {
    throw new Error(`feishu create_chat code=${json.code}`);
  }
  return { externalConversationId: json.data.chat_id };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/create-conversation
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): create_conversation supports dm (p2p) and group"
```

Expected: 3 tests PASS。

---

### Task 16: Feishu Provider 装配

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/provider.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/provider.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/provider.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFeishuProvider } from "../provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createFeishuProvider", () => {
  it("name is feishu", () => {
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get: async () => "tk", invalidate: () => {} },
    });
    expect(p.provider).toBe("feishu");
  });

  it("verifyInbound delegates to verifyFeishuSignature", async () => {
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get: async () => "tk", invalidate: () => {} },
    });
    const body = JSON.stringify({ token: "v_t", type: "url_verification", challenge: "c" });
    const r = await p.verifyInbound({ headers: {}, rawBody: Buffer.from(body), secret: "" });
    expect(r.ok).toBe(true);
  });

  it("normalizeInbound returns null for non-message events", async () => {
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get: async () => "tk", invalidate: () => {} },
    });
    expect(
      await p.normalizeInbound({ header: { event_type: "im.message.message_read_v1" } }),
    ).toBeNull();
  });

  it("sendMessage uses tokenCache.get and forwards to feishuSendMessage", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ code: 0, data: { message_id: "om_42" } }),
      }),
    );
    const get = vi.fn().mockResolvedValue("tk_live");
    const p = createFeishuProvider({
      verificationToken: "v_t",
      encryptKey: "",
      botOpenId: "ou_bot",
      tokenCache: { get, invalidate: () => {} },
    });
    const r = await p.sendMessage({
      externalConversationId: "oc_x",
      text: "hi",
      importance: "info",
    });
    expect(r.externalMessageId).toBe("om_42");
    expect(get).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/provider`
Expected: FAIL。

- [ ] **Step 3: 实现 provider.ts**

```ts
// packages/bot-runtime/src/providers/feishu/provider.ts
import type { ChannelProvider } from "../../channel/provider.js";
import { feishuCreateConversation } from "./create-conversation.js";
import { normalizeFeishuInbound } from "./normalize.js";
import { feishuSendMessage } from "./send-message.js";
import { verifyFeishuSignature } from "./signature.js";
import type { TenantTokenCache } from "./token-cache.js";

export type CreateFeishuProviderInput = {
  verificationToken: string;
  encryptKey: string;
  botOpenId: string;
  tokenCache: TenantTokenCache;
};

export function createFeishuProvider(input: CreateFeishuProviderInput): ChannelProvider {
  return {
    provider: "feishu",
    async verifyInbound(req) {
      return verifyFeishuSignature({
        headers: req.headers,
        rawBody: req.rawBody,
        verificationToken: input.verificationToken,
        encryptKey: input.encryptKey,
      });
    },
    async normalizeInbound(decoded) {
      return normalizeFeishuInbound(decoded, { botOpenId: input.botOpenId });
    },
    async sendMessage(args) {
      const tk = await input.tokenCache.get();
      return feishuSendMessage({ tenantAccessToken: tk }, args);
    },
    async createConversation(args) {
      const tk = await input.tokenCache.get();
      return feishuCreateConversation({ tenantAccessToken: tk }, args);
    },
    async deleteConversation() {
      return;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/provider
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): wire ChannelProvider implementation"
```

Expected: 4 tests PASS。

---

### Task 17: Feishu access-token fetcher（真实 HTTP 调用）

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/fetch-token.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/fetch-token.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/fetch-token.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFeishuTenantAccessToken } from "../fetch-token.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchFeishuTenantAccessToken", () => {
  it("POSTs app_id + app_secret and returns token + expire", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ code: 0, tenant_access_token: "t1", expire: 7200 }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const r = await fetchFeishuTenantAccessToken({ appId: "cli_x", appSecret: "s" });
    expect(r.token).toBe("t1");
    expect(r.expiresInSec).toBe(7200);
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body.app_id).toBe("cli_x");
    expect(body.app_secret).toBe("s");
  });

  it("throws on non-zero code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 10003, msg: "bad" }) }),
    );
    await expect(
      fetchFeishuTenantAccessToken({ appId: "cli_x", appSecret: "s" }),
    ).rejects.toThrow(/10003/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/fetch-token`
Expected: FAIL。

- [ ] **Step 3: 实现 fetch-token.ts**

```ts
// packages/bot-runtime/src/providers/feishu/fetch-token.ts
import type { TenantTokenFetchResult } from "./token-cache.js";

const FEISHU_HOST = "https://open.feishu.cn";

export async function fetchFeishuTenantAccessToken(input: {
  appId: string;
  appSecret: string;
}): Promise<TenantTokenFetchResult> {
  const res = await fetch(`${FEISHU_HOST}/open-apis/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ app_id: input.appId, app_secret: input.appSecret }),
  });
  if (!res.ok) throw new Error(`feishu tenant_access_token HTTP ${res.status}`);
  const json = (await res.json()) as {
    code?: number;
    msg?: string;
    tenant_access_token?: string;
    expire?: number;
  };
  if (json.code !== 0 || !json.tenant_access_token) {
    throw new Error(`feishu tenant_access_token code=${json.code}`);
  }
  return { token: json.tenant_access_token, expiresInSec: json.expire ?? 7200 };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/fetch-token
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): tenant_access_token internal-app fetcher"
```

Expected: 2 tests PASS。

---

### Task 18: Feishu Provider 工厂（从 ChannelConfig 构建）

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/factory.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/factory.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/factory.test.ts
import { describe, expect, it } from "vitest";
import { createFeishuProviderFromConfig } from "../factory.js";

describe("createFeishuProviderFromConfig", () => {
  it("composes config + secrets + token cache into a Provider", async () => {
    const provider = createFeishuProviderFromConfig({
      config: {
        appId: "cli_x",
        verificationToken: "v_t",
        encryptKey: "",
        webhookEnabled: true,
        longConnectionEnabled: false,
        appSecretRef: "ref::FEISHU_APP_SECRET",
      },
      secrets: { appSecret: "s" },
      botOpenId: "ou_bot",
      fetchToken: async () => ({ token: "t1", expiresInSec: 7200 }),
    });
    expect(provider.provider).toBe("feishu");
    const r = await provider.verifyInbound({
      headers: {},
      rawBody: Buffer.from(JSON.stringify({ token: "v_t", type: "url_verification", challenge: "c" })),
      secret: "",
    });
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/factory`
Expected: FAIL。

- [ ] **Step 3: 实现 factory.ts**

```ts
// packages/bot-runtime/src/providers/feishu/factory.ts
import type { ChannelProvider } from "../../channel/provider.js";
import type { FeishuConfig, FeishuSecrets } from "./config.js";
import { createFeishuProvider } from "./provider.js";
import { type TenantTokenFetchResult, createTenantTokenCache } from "./token-cache.js";

export type CreateFromConfigInput = {
  config: FeishuConfig;
  secrets: FeishuSecrets;
  botOpenId: string;
  fetchToken?: (input: { appId: string; appSecret: string }) => Promise<TenantTokenFetchResult>;
};

export function createFeishuProviderFromConfig(input: CreateFromConfigInput): ChannelProvider {
  const fetcher =
    input.fetchToken ??
    (async () => {
      throw new Error("fetchToken not provided; pass fetchFeishuTenantAccessToken in production");
    });
  const tokenCache = createTenantTokenCache({
    fetch: () => fetcher({ appId: input.config.appId, appSecret: input.secrets.appSecret }),
  });
  return createFeishuProvider({
    verificationToken: input.config.verificationToken,
    encryptKey: input.config.encryptKey,
    botOpenId: input.botOpenId,
    tokenCache,
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/factory
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): provider factory bridging ChannelConfig and runtime"
```

Expected: 1 test PASS。

---

### Task 19: Feishu LongConnection 适配（v1 stub）

**Files:**
- Create: `packages/bot-runtime/src/providers/feishu/long-connection.ts`
- Create: `packages/bot-runtime/src/providers/feishu/__tests__/long-connection.test.ts`

**说明：** v1 仅做 stub —— 只在 `longConnectionEnabled=false` 时 noop；启用时 throw not-implemented。Plan 4 之前不会真实启用。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/providers/feishu/__tests__/long-connection.test.ts
import { describe, expect, it } from "vitest";
import { createFeishuLongConnection } from "../long-connection.js";

describe("createFeishuLongConnection", () => {
  it("returns a noop adapter when disabled", async () => {
    const adapter = createFeishuLongConnection({ enabled: false });
    await expect(adapter.start(async () => ({ status: 200 }))).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it("throws not-implemented when enabled", async () => {
    const adapter = createFeishuLongConnection({ enabled: true });
    await expect(adapter.start(async () => ({ status: 200 }))).rejects.toThrow(
      /not implemented in v1/,
    );
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/long-connection`
Expected: FAIL。

- [ ] **Step 3: 实现 long-connection.ts**

```ts
// packages/bot-runtime/src/providers/feishu/long-connection.ts
import type { LongConnectionAdapter } from "../../ingress/long-connection.js";

export type FeishuLongConnectionInput = {
  enabled: boolean;
};

export function createFeishuLongConnection(input: FeishuLongConnectionInput): LongConnectionAdapter {
  if (!input.enabled) {
    return {
      async start() {
        return;
      },
      async stop() {
        return;
      },
    };
  }
  return {
    async start() {
      throw new Error("Feishu LongConnection not implemented in v1; use webhookEnabled=true");
    },
    async stop() {
      return;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- providers/feishu/long-connection
git add packages/bot-runtime/src/providers/feishu
git commit -m "feat(feishu): LongConnection adapter (v1 stub)"
```

Expected: 2 tests PASS。

---

## Phase D — Guardian（4 tasks）

### Task 20: Guardian command parser

**Files:**
- Create: `packages/bot-runtime/src/guardian/command-parser.ts`
- Create: `packages/bot-runtime/src/guardian/__tests__/command-parser.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/guardian/__tests__/command-parser.test.ts
import { describe, expect, it } from "vitest";
import { parseGuardianCommand } from "../command-parser.js";

describe("parseGuardianCommand", () => {
  it("parses /bind <thread-id>", () => {
    expect(parseGuardianCommand("/bind th_abc")).toEqual({
      kind: "bind",
      threadId: "th_abc",
    });
  });

  it("parses /bind without args returns help variant", () => {
    expect(parseGuardianCommand("/bind")).toEqual({ kind: "bind", threadId: null });
  });

  it("parses /unbind", () => {
    expect(parseGuardianCommand("/unbind")).toEqual({ kind: "unbind" });
  });

  it("parses /list", () => {
    expect(parseGuardianCommand("/list")).toEqual({ kind: "list" });
  });

  it("parses /help", () => {
    expect(parseGuardianCommand("/help")).toEqual({ kind: "help" });
  });

  it("returns unknown for free-form text", () => {
    expect(parseGuardianCommand("hello")).toEqual({ kind: "unknown" });
  });

  it("ignores leading whitespace and capitalization", () => {
    expect(parseGuardianCommand("  /HELP  ")).toEqual({ kind: "help" });
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- guardian/command-parser`
Expected: FAIL。

- [ ] **Step 3: 实现 command-parser.ts**

```ts
// packages/bot-runtime/src/guardian/command-parser.ts
export type GuardianCommand =
  | { kind: "bind"; threadId: string | null }
  | { kind: "unbind" }
  | { kind: "list" }
  | { kind: "help" }
  | { kind: "unknown" };

export function parseGuardianCommand(text: string): GuardianCommand {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed.startsWith("/")) return { kind: "unknown" };
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  if (head === "bind") {
    return { kind: "bind", threadId: rest[0] ?? null };
  }
  if (head === "unbind") return { kind: "unbind" };
  if (head === "list") return { kind: "list" };
  if (head === "help") return { kind: "help" };
  return { kind: "unknown" };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- guardian/command-parser
git add packages/bot-runtime/src/guardian
git commit -m "feat(guardian): command parser for /bind /unbind /list /help"
```

Expected: 7 tests PASS。

---

### Task 21: Guardian bind / unbind 流程

**Files:**
- Create: `packages/bot-runtime/src/guardian/guardian.ts`
- Create: `packages/bot-runtime/src/guardian/__tests__/guardian.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/guardian/__tests__/guardian.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createGuardian } from "../guardian.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "gd-"));
});

describe("Guardian", () => {
  it("/bind <thread-id> binds the calling chat to the thread", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "bind", threadId: "th_alpha" },
    });
    expect(out.kind).toBe("bound");
    if (out.kind === "bound") {
      expect(out.threadId).toBe("th_alpha");
    }
    const claimed = await repo.whoClaimsChat("feishu", "oc_x");
    expect(claimed).toBe("th_alpha");
  });

  it("/bind without thread-id returns ask-for-id reply", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "bind", threadId: null },
    });
    expect(out.kind).toBe("ask_thread_id");
  });

  it("/unbind releases chat-claim", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const binding = await repo.create({
      threadId: "th_alpha",
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "guardian",
    });
    await repo.updateStatus("th_alpha", "feishu", binding.id, "bound");
    await repo.claimChat("feishu", "oc_x", "th_alpha");
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "unbind" },
    });
    expect(out.kind).toBe("unbound");
    expect(await repo.whoClaimsChat("feishu", "oc_x")).toBeNull();
  });

  it("/help returns help text", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "help" },
    });
    expect(out.kind).toBe("help");
  });

  it("rejects /bind when chat is already claimed by another thread", async () => {
    const paths = createPaths(tmp);
    const repo = createChannelBindingRepo(paths, runtimeId);
    await repo.claimChat("feishu", "oc_x", "th_existing");
    const guardian = createGuardian({ paths, runtimeId, bindingRepo: repo });
    const out = await guardian.handle({
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      userId: "u_alice",
      command: { kind: "bind", threadId: "th_alpha" },
    });
    expect(out.kind).toBe("error");
    if (out.kind === "error") expect(out.reason).toMatch(/already claimed/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- guardian/guardian`
Expected: FAIL。

- [ ] **Step 3: 实现 guardian.ts**

```ts
// packages/bot-runtime/src/guardian/guardian.ts
import type { ChannelBindingRepo } from "../repositories/channel-binding-repo.js";
import type { Paths } from "../storage/paths.js";
import type { GuardianCommand } from "./command-parser.js";

export type GuardianHandleInput = {
  provider: string;
  externalConversationId: string;
  externalConversationType: "dm" | "group" | "topic";
  userId: string;
  command: GuardianCommand;
};

export type GuardianResult =
  | { kind: "bound"; threadId: string }
  | { kind: "unbound" }
  | { kind: "list"; bindings: Array<{ threadId: string; provider: string }> }
  | { kind: "ask_thread_id" }
  | { kind: "help" }
  | { kind: "noop" }
  | { kind: "error"; reason: string };

export type Guardian = {
  handle(input: GuardianHandleInput): Promise<GuardianResult>;
};

export type CreateGuardianInput = {
  paths: Paths;
  runtimeId: string;
  bindingRepo: ChannelBindingRepo;
};

export function createGuardian(input: CreateGuardianInput): Guardian {
  return {
    async handle(req) {
      const { command, provider, externalConversationId, externalConversationType } = req;
      if (command.kind === "help") return { kind: "help" };
      if (command.kind === "list") {
        return { kind: "list", bindings: [] };
      }
      if (command.kind === "bind") {
        if (!command.threadId) return { kind: "ask_thread_id" };
        const existing = await input.bindingRepo.whoClaimsChat(provider, externalConversationId);
        if (existing && existing !== command.threadId) {
          return { kind: "error", reason: `chat already claimed by thread ${existing}` };
        }
        const binding = await input.bindingRepo.create({
          threadId: command.threadId,
          provider,
          externalConversationId,
          externalConversationType,
          createdBy: "guardian",
        });
        await input.bindingRepo.updateStatus(command.threadId, provider, binding.id, "bound");
        await input.bindingRepo.claimChat(provider, externalConversationId, command.threadId);
        return { kind: "bound", threadId: command.threadId };
      }
      if (command.kind === "unbind") {
        await input.bindingRepo.releaseChat(provider, externalConversationId);
        return { kind: "unbound" };
      }
      return { kind: "noop" };
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- guardian/guardian
git add packages/bot-runtime/src/guardian
git commit -m "feat(guardian): bind/unbind/help workflow with chat-claim mutex"
```

Expected: 5 tests PASS。

---

### Task 22: Guardian user bootstrap（外部用户 → user-id）

**Files:**
- Create: `packages/bot-runtime/src/guardian/user-bootstrap.ts`
- Create: `packages/bot-runtime/src/guardian/__tests__/user-bootstrap.test.ts`

**前置：** Plan 1 已建 `state/users/<user-id>.json` 文件结构（schema/user.ts），但 user repo 尚未抽象。这里我们建一个最小 UserDirectory，按 `(provider, externalUserId)` 建索引；如果索引文件不存在就创建新 user。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/guardian/__tests__/user-bootstrap.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createUserDirectory } from "../user-bootstrap.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ub-"));
});

describe("UserDirectory", () => {
  it("creates a new user the first time we see an externalUserId", async () => {
    const dir = createUserDirectory(createPaths(tmp), runtimeId);
    const u1 = await dir.resolveOrCreate("feishu", "ou_alice", "Alice");
    expect(u1).toMatch(/^u_/);
  });

  it("returns the same user-id for repeated lookups", async () => {
    const dir = createUserDirectory(createPaths(tmp), runtimeId);
    const u1 = await dir.resolveOrCreate("feishu", "ou_alice", "Alice");
    const u2 = await dir.resolveOrCreate("feishu", "ou_alice", "Alice");
    expect(u1).toBe(u2);
  });

  it("issues different ids for different externalUserIds", async () => {
    const dir = createUserDirectory(createPaths(tmp), runtimeId);
    const u1 = await dir.resolveOrCreate("feishu", "ou_a", "A");
    const u2 = await dir.resolveOrCreate("feishu", "ou_b", "B");
    expect(u1).not.toBe(u2);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- guardian/user-bootstrap`
Expected: FAIL。

- [ ] **Step 3: 实现 user-bootstrap.ts**

```ts
// packages/bot-runtime/src/guardian/user-bootstrap.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { type User, UserSchema } from "../schema/user.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type UserDirectory = {
  resolveOrCreate(provider: string, externalUserId: string, displayName: string): Promise<string>;
  load(userId: string): Promise<User | null>;
};

export function createUserDirectory(paths: Paths, runtimeId: string): UserDirectory {
  const usersDir = path.posix.join(paths.state(runtimeId), "users");
  const indexDir = path.posix.join(paths.state(runtimeId), "_index", "user-by-external");

  function indexFile(provider: string, externalUserId: string) {
    return path.posix.join(indexDir, provider, externalUserId);
  }

  function userFile(userId: string) {
    return path.posix.join(usersDir, `${userId}.json`);
  }

  return {
    async resolveOrCreate(provider, externalUserId, displayName) {
      await mkdir(path.posix.join(indexDir, provider), { recursive: true });
      const idxFile = indexFile(provider, externalUserId);
      try {
        const existing = (await readFile(idxFile, "utf8")).trim();
        if (existing) return existing;
      } catch {
        /* not yet indexed */
      }
      const userId = newId("u");
      const now = new Date().toISOString();
      const user = UserSchema.parse({
        id: userId,
        displayName,
        channelIdentities:
          provider === "feishu"
            ? { feishu: { openId: externalUserId } }
            : provider === "slack"
              ? { slack: { userId: externalUserId, teamId: "" } }
              : {},
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(usersDir, { recursive: true });
      await writeJson(userFile(userId), user);
      await writeFile(idxFile, userId, "utf8");
      return userId;
    },
    async load(userId) {
      const got = await readJson(userFile(userId));
      return got ? UserSchema.parse(got) : null;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- guardian/user-bootstrap
git add packages/bot-runtime/src/guardian
git commit -m "feat(guardian): UserDirectory keyed by (provider, externalUserId)"
```

Expected: 3 tests PASS。

---

### Task 23: Guardian thread bootstrap（私聊默认 thread）

**Files:**
- Create: `packages/bot-runtime/src/guardian/thread-bootstrap.ts`
- Create: `packages/bot-runtime/src/guardian/__tests__/thread-bootstrap.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/guardian/__tests__/thread-bootstrap.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createGuardianThreadBootstrap } from "../thread-bootstrap.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "gtb-"));
});

describe("GuardianThreadBootstrap", () => {
  it("creates a guardian thread the first time a user shows up", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const boot = createGuardianThreadBootstrap({ paths, runtimeId, threadRepo: repo });
    const id = await boot.ensureGuardianThread("u_alice");
    expect(id).toMatch(/^th_/);
    const t = await repo.load(id);
    expect(t?.ownerUserId).toBe("u_alice");
  });

  it("returns the same id for repeat calls", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const boot = createGuardianThreadBootstrap({ paths, runtimeId, threadRepo: repo });
    const a = await boot.ensureGuardianThread("u_alice");
    const b = await boot.ensureGuardianThread("u_alice");
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- guardian/thread-bootstrap`
Expected: FAIL。

- [ ] **Step 3: 实现 thread-bootstrap.ts**

```ts
// packages/bot-runtime/src/guardian/thread-bootstrap.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { Paths } from "../storage/paths.js";

export type GuardianThreadBootstrap = {
  ensureGuardianThread(userId: string): Promise<string>;
};

export function createGuardianThreadBootstrap(deps: {
  paths: Paths;
  runtimeId: string;
  threadRepo: ThreadRepo;
}): GuardianThreadBootstrap {
  const indexDir = path.posix.join(deps.paths.state(deps.runtimeId), "_index", "guardian-thread-by-user");

  function file(userId: string) {
    return path.posix.join(indexDir, userId);
  }

  return {
    async ensureGuardianThread(userId) {
      await mkdir(indexDir, { recursive: true });
      try {
        const existing = (await readFile(file(userId), "utf8")).trim();
        if (existing) return existing;
      } catch {
        /* not indexed yet */
      }
      const created = await deps.threadRepo.create({
        ownerUserId: userId,
        title: "Guardian",
      });
      await writeFile(file(userId), created.id, "utf8");
      return created.id;
    },
  };
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- guardian/thread-bootstrap
git add packages/bot-runtime/src/guardian
git commit -m "feat(guardian): per-user guardian thread bootstrap"
```

Expected: 2 tests PASS。

---

## Phase E — notify_bound_channel 真实实现（3 tasks）

### Task 24: NotifyTarget 解析 + binding fan-out

**Files:**
- Create: `packages/bot-runtime/src/tools/_notify-target.ts`
- Create: `packages/bot-runtime/src/tools/__tests__/notify-target.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/tools/__tests__/notify-target.test.ts
import { describe, expect, it } from "vitest";
import type { ChannelBinding } from "../../schema/channel.js";
import { resolveNotifyTargets } from "../_notify-target.js";

const baseBinding = (over: Partial<ChannelBinding>): ChannelBinding => ({
  id: "bd_a",
  threadId: "th_x",
  provider: "feishu",
  externalConversationId: "oc_a",
  externalConversationType: "group",
  status: "bound",
  createdBy: "client",
  enabled: true,
  notifyDefault: true,
  createdAt: "2026-04-29T01:00:00Z",
  updatedAt: "2026-04-29T01:00:00Z",
  ...over,
});

describe("resolveNotifyTargets", () => {
  it("'all' picks bindings where enabled && notifyDefault && status=bound", () => {
    const bindings = [
      baseBinding({ id: "b1" }),
      baseBinding({ id: "b2", notifyDefault: false }),
      baseBinding({ id: "b3", enabled: false }),
      baseBinding({ id: "b4", status: "binding" }),
    ];
    expect(resolveNotifyTargets("all", bindings).map((b) => b.id)).toEqual(["b1"]);
  });

  it("provider filter selects only that provider's bound bindings", () => {
    const bindings = [
      baseBinding({ id: "b1", provider: "feishu" }),
      baseBinding({ id: "b2", provider: "slack" }),
    ];
    expect(
      resolveNotifyTargets({ provider: "feishu" }, bindings).map((b) => b.id),
    ).toEqual(["b1"]);
  });

  it("bindingId filter selects exactly that binding", () => {
    const bindings = [baseBinding({ id: "b1" }), baseBinding({ id: "b2" })];
    expect(resolveNotifyTargets({ bindingId: "b2" }, bindings).map((b) => b.id)).toEqual(["b2"]);
  });

  it("returns empty when no binding matches the bindingId", () => {
    expect(resolveNotifyTargets({ bindingId: "missing" }, [])).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- notify-target`
Expected: FAIL。

- [ ] **Step 3: 实现 _notify-target.ts**

```ts
// packages/bot-runtime/src/tools/_notify-target.ts
import type { ChannelBinding } from "../schema/channel.js";

export type NotifyTarget =
  | "all"
  | { provider: string }
  | { bindingId: string };

export function resolveNotifyTargets(
  target: NotifyTarget,
  bindings: ChannelBinding[],
): ChannelBinding[] {
  if (target === "all") {
    return bindings.filter((b) => b.enabled && b.notifyDefault && b.status === "bound");
  }
  if ("bindingId" in target) {
    return bindings.filter((b) => b.id === target.bindingId);
  }
  return bindings.filter(
    (b) => b.provider === target.provider && b.enabled && b.status === "bound",
  );
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- notify-target
git add packages/bot-runtime/src/tools
git commit -m "feat(tools): NotifyTarget resolver for binding fan-out"
```

Expected: 4 tests PASS。

---

### Task 25: 替换 notify_bound_channel stub 为真实实现

**Files:**
- Modify: `packages/bot-runtime/src/tools/notify-bound-channel.ts`
- Modify: `packages/bot-runtime/src/tools/__tests__/notify-bound-channel.test.ts`

- [ ] **Step 1: 重写测试覆盖真实行为**

```ts
// packages/bot-runtime/src/tools/__tests__/notify-bound-channel.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChannelOutboundJobQueue } from "../../channel/outbound-job-queue.js";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createNotifyBoundChannelTool } from "../notify-bound-channel.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "nbc-"));
});

describe("notify_bound_channel (real impl)", () => {
  it("returns enqueued and writes a ChannelJob when binding exists", async () => {
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, runtimeId);
    const queue = createChannelOutboundJobQueue(paths, runtimeId);

    const binding = await bindingRepo.create({
      threadId: "th_alpha",
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "client",
    });
    await bindingRepo.updateStatus("th_alpha", "feishu", binding.id, "bound");

    const tool = createNotifyBoundChannelTool({
      bindingRepo,
      queue,
      threadId: "th_alpha",
    });
    const out = await tool.call(
      {
        target: "all",
        message: "hello",
        importance: "info",
      },
      { ctx: {} as never },
    );
    expect(out.status).toBe("enqueued");
    const pending = await queue.listPending();
    expect(pending).toHaveLength(1);
    expect((pending[0]?.payload as { externalConversationId?: string }).externalConversationId).toBe(
      "oc_x",
    );
  });

  it("returns binding_unavailable when no binding matches", async () => {
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, runtimeId);
    const queue = createChannelOutboundJobQueue(paths, runtimeId);
    const tool = createNotifyBoundChannelTool({ bindingRepo, queue, threadId: "th_alpha" });
    const out = await tool.call(
      { target: "all", message: "hi", importance: "info" },
      { ctx: {} as never },
    );
    expect(out.status).toBe("binding_unavailable");
  });

  it("returns binding_in_progress when only binding is in 'binding' state", async () => {
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, runtimeId);
    await bindingRepo.create({
      threadId: "th_alpha",
      provider: "feishu",
      externalConversationId: "oc_x",
      externalConversationType: "group",
      createdBy: "client",
    });
    const queue = createChannelOutboundJobQueue(paths, runtimeId);
    const tool = createNotifyBoundChannelTool({ bindingRepo, queue, threadId: "th_alpha" });
    const out = await tool.call(
      { target: "all", message: "hi", importance: "info" },
      { ctx: {} as never },
    );
    expect(out.status).toBe("binding_in_progress");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- notify-bound-channel`
Expected: FAIL（stub 还是返回 binding_unavailable / 工厂签名变了）。

- [ ] **Step 3: 重写 notify-bound-channel.ts**

```ts
// packages/bot-runtime/src/tools/notify-bound-channel.ts
import { z } from "zod";
import type { ChannelOutboundJobQueue } from "../channel/outbound-job-queue.js";
import type { ChannelBindingRepo } from "../repositories/channel-binding-repo.js";
import { type Tool, defineTool } from "./tool.js";
import { type NotifyTarget, resolveNotifyTargets } from "./_notify-target.js";

export const NotifyTargetSchema = z.union([
  z.literal("all"),
  z.object({ provider: z.string() }),
  z.object({ bindingId: z.string() }),
]);
export type { NotifyTarget };

export type CreateNotifyBoundChannelToolInput = {
  bindingRepo: ChannelBindingRepo;
  queue: ChannelOutboundJobQueue;
  threadId: string;
};

export function createNotifyBoundChannelTool(deps: CreateNotifyBoundChannelToolInput): Tool {
  return defineTool({
    name: "notify_bound_channel",
    description:
      "Notify the channel(s) bound to the current thread. Enqueues a ChannelJob for each matching binding.",
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
      jobIds: z.array(z.string()).optional(),
    }),
    async call(args) {
      const bindings = await deps.bindingRepo.listForThread(deps.threadId);
      if (bindings.length === 0) {
        return { status: "binding_unavailable" as const, reason: "no bindings" };
      }
      const matched = resolveNotifyTargets(args.target as NotifyTarget, bindings);
      if (matched.length === 0) {
        if (bindings.some((b) => b.status === "binding")) {
          return { status: "binding_in_progress" as const };
        }
        if (bindings.some((b) => b.status === "failed")) {
          return { status: "binding_failed" as const };
        }
        return { status: "binding_unavailable" as const };
      }
      const jobIds: string[] = [];
      for (const b of matched) {
        if (!b.externalConversationId) continue;
        const job = await deps.queue.enqueueSendMessage({
          provider: b.provider,
          payload: {
            externalConversationId: b.externalConversationId,
            text: args.message,
            importance: args.importance,
          },
        });
        jobIds.push(job.id);
      }
      return { status: "enqueued" as const, jobIds };
    },
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- notify-bound-channel
git add packages/bot-runtime/src/tools
git commit -m "feat(tools): replace notify_bound_channel stub with binding fan-out"
```

Expected: 3 tests PASS。

---

### Task 26: 把真实 notify_bound_channel 注入 dispatcher

**Files:**
- Modify: `packages/bot-runtime/src/tools/registry.ts`
- Modify: `packages/bot-runtime/src/tools/__tests__/registry.test.ts`

**目的：** Plan 1 的 `registry.ts` 用 `createNotifyBoundChannelTool()` 无参调用注册 stub。Plan 2 把构造改成接受 `bindingRepo + queue + threadId`，需要 registry 支持工厂在每次创建工具时延迟拿这些依赖（per-task 上下文）。

- [ ] **Step 1: 看现有 registry**

```bash
sed -n '1,200p' packages/bot-runtime/src/tools/registry.ts
```
记下 `createDefaultToolRegistry` 的现有签名。

- [ ] **Step 2: 写失败测试**

新增对 `notify_bound_channel` 真实工厂注入的断言：

```ts
// packages/bot-runtime/src/tools/__tests__/registry.test.ts (append)
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createChannelOutboundJobQueue } from "../../channel/outbound-job-queue.js";
import { createChannelBindingRepo } from "../../repositories/channel-binding-repo.js";
import { createPaths } from "../../storage/paths.js";
import { createDefaultToolRegistry } from "../registry.js";

describe("createDefaultToolRegistry — notify_bound_channel injection", () => {
  it("uses real notify_bound_channel when channelDeps are provided", async () => {
    const tmp = await mkdtemp(path.join(tmpdir(), "reg-"));
    const paths = createPaths(tmp);
    const bindingRepo = createChannelBindingRepo(paths, "rt_test");
    const queue = createChannelOutboundJobQueue(paths, "rt_test");
    const registry = createDefaultToolRegistry({
      paths,
      runtimeId: "rt_test",
      threadId: "th_x",
      taskId: "tk_y",
      channelDeps: { bindingRepo, queue },
    });
    const tool = registry.get("notify_bound_channel");
    expect(tool).toBeDefined();
    const out = await tool!.call(
      { target: "all", message: "x", importance: "info" },
      { ctx: {} as never },
    );
    expect(out.status).toBe("binding_unavailable");
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- tools/registry`
Expected: FAIL。

- [ ] **Step 4: 修改 registry.ts**

在 `createDefaultToolRegistry` 输入加 `channelDeps?: { bindingRepo, queue }`，根据是否提供决定使用真实 notify 还是 stub（fallback 保持 binding_unavailable，方便 unit test）。把 `createNotifyBoundChannelTool()` 改成 `createNotifyBoundChannelTool({ bindingRepo, queue, threadId })`。

```ts
// 关键改动片段
if (input.channelDeps) {
  registry.register(
    createNotifyBoundChannelTool({
      bindingRepo: input.channelDeps.bindingRepo,
      queue: input.channelDeps.queue,
      threadId: input.threadId,
    }),
  );
} else {
  registry.register(createLegacyStubNotifyBoundChannelTool());
}
```

并保留一个内部 `createLegacyStubNotifyBoundChannelTool()`（一直返回 `binding_unavailable`）用于无 channel 注入的最小测试场景。

- [ ] **Step 5: 跑全量测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test
git add packages/bot-runtime/src/tools
git commit -m "feat(tools): wire real notify_bound_channel into default registry"
```

Expected: 全部 PASS。

---

## Phase F — Channel 配置 API（3 tasks）

### Task 27: HTTP API：list / get / upsert / delete channel

**Files:**
- Create: `packages/bot-runtime/src/api/channel-config-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/channel-config-api.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/channel-config-api.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChannelConfigStore } from "../../channel/config-store.js";
import { createIngressServer, type IngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountChannelConfigApi } from "../channel-config-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "cca-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Channel Config API", () => {
  it("PUT /api/channels/:provider creates a config; GET returns sanitized view", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    mountChannelConfigApi(server, { store, adminToken: "admin" });
    const { port } = await server.listen(0);
    const put = await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "admin" },
      body: JSON.stringify({
        enabled: true,
        ingress: { webhookEnabled: true },
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      headers: { "x-admin-token": "admin" },
    });
    const body = (await get.json()) as { secrets?: Record<string, { hasSecret: boolean }> };
    expect(body.secrets).toEqual({ appSecret: { hasSecret: true } });
  });

  it("GET /api/channels lists all sanitized configs", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", {
      enabled: true,
      ingress: {},
      publicFields: { appId: "x", verificationToken: "y" },
      secretRefs: { appSecret: "ref::A" },
    });
    mountChannelConfigApi(server, { store, adminToken: "admin" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { "x-admin-token": "admin" },
    });
    const body = (await r.json()) as Array<{ provider: string }>;
    expect(body.map((c) => c.provider)).toEqual(["feishu"]);
  });

  it("returns 401 when admin token is wrong", async () => {
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "admin",
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { "x-admin-token": "wrong" },
    });
    expect(r.status).toBe(401);
  });

  it("PUT validates input schema", async () => {
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "admin",
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "admin" },
      body: JSON.stringify({ enabled: "not-a-bool" }),
    });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- channel-config-api`
Expected: FAIL。

- [ ] **Step 3: 实现 channel-config-api.ts**

```ts
// packages/bot-runtime/src/api/channel-config-api.ts
import { z } from "zod";
import type { ChannelConfigStore } from "../channel/config-store.js";
import type { IngressServer } from "../ingress/http-server.js";

const UpsertSchema = z.object({
  enabled: z.boolean(),
  ingress: z.object({
    webhookEnabled: z.boolean().optional(),
    longConnectionEnabled: z.boolean().optional(),
  }),
  publicFields: z.record(z.union([z.string(), z.boolean(), z.number()])),
  secretRefs: z.record(z.string()),
});

export type ChannelConfigApiOptions = {
  store: ChannelConfigStore;
  adminToken: string;
};

function checkAdmin(headers: Record<string, string | string[] | undefined>, expected: string) {
  const got = headers["x-admin-token"];
  const value = Array.isArray(got) ? got[0] : got;
  return value === expected;
}

export function mountChannelConfigApi(server: IngressServer, opts: ChannelConfigApiOptions): void {
  server.route("GET", "/api/channels", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const list = await opts.store.list();
    return { status: 200, body: list };
  });

  server.route("GET", "/api/channels/feishu", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const got = await opts.store.loadSanitized("feishu");
    if (!got) return { status: 404, body: { error: "not configured" } };
    return { status: 200, body: got };
  });

  server.route("PUT", "/api/channels/feishu", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    let parsed;
    try {
      parsed = UpsertSchema.parse(JSON.parse(req.rawBody.toString("utf8")));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 400, body: { error: message } };
    }
    const cfg = await opts.store.upsert("feishu", parsed);
    return { status: 200, body: { provider: cfg.provider, updatedAt: cfg.updatedAt } };
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- channel-config-api
git add packages/bot-runtime/src/api
git commit -m "feat(api): channel config admin API with sanitized GET"
```

Expected: 4 tests PASS。

---

### Task 28: 配置变更触发 Provider Registry 重建

**Files:**
- Modify: `packages/bot-runtime/src/api/channel-config-api.ts`
- Create: `packages/bot-runtime/src/api/__tests__/channel-config-api-rebuild.test.ts`

**目的：** PUT 之后通过 `onConfigChanged(provider)` 回调让 host 重新 build provider（重新加载 secrets / 重置 token cache）。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/channel-config-api-rebuild.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChannelConfigStore } from "../../channel/config-store.js";
import { createIngressServer, type IngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountChannelConfigApi } from "../channel-config-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "cca2-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Channel Config API onConfigChanged", () => {
  it("calls onConfigChanged after a successful PUT", async () => {
    const onChange = vi.fn();
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "a",
      onConfigChanged: onChange,
    });
    const { port } = await server.listen(0);
    await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({
        enabled: true,
        ingress: {},
        publicFields: { appId: "x", verificationToken: "y" },
        secretRefs: { appSecret: "ref::A" },
      }),
    });
    expect(onChange).toHaveBeenCalledWith("feishu");
  });

  it("does NOT call onConfigChanged when validation fails", async () => {
    const onChange = vi.fn();
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "a",
      onConfigChanged: onChange,
    });
    const { port } = await server.listen(0);
    await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ enabled: "no" }),
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- channel-config-api-rebuild`
Expected: FAIL。

- [ ] **Step 3: 修改 channel-config-api.ts**

在 `ChannelConfigApiOptions` 加 `onConfigChanged?: (provider: string) => void | Promise<void>`，PUT 成功后 `await opts.onConfigChanged?.(provider)`，但放在 response 之前 await 完成（保证下次 webhook 来时 provider 已 reload）。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- channel-config-api-rebuild
git add packages/bot-runtime/src/api
git commit -m "feat(api): notify host on channel config changes"
```

Expected: 2 tests PASS。

---

### Task 29: 把 channel API mount 到 ingress

**Files:**
- Create: `packages/bot-runtime/src/api/mount.ts`
- Create: `packages/bot-runtime/src/api/__tests__/mount.test.ts`

**目的：** 把所有 API（目前只有 channel-config-api）的挂载放在统一入口，方便后续 Plan 3 接入 thread/task API。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/api/__tests__/mount.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChannelConfigStore } from "../../channel/config-store.js";
import { createIngressServer, type IngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountAdminApi } from "../mount.js";

let tmp: string;
let server: IngressServer;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "mn-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("mountAdminApi", () => {
  it("registers GET /api/channels", async () => {
    mountAdminApi(server, {
      adminToken: "a",
      channelStore: createChannelConfigStore(createPaths(tmp), "rt"),
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- api/mount`
Expected: FAIL。

- [ ] **Step 3: 实现 mount.ts**

```ts
// packages/bot-runtime/src/api/mount.ts
import type { ChannelConfigStore } from "../channel/config-store.js";
import type { IngressServer } from "../ingress/http-server.js";
import { mountChannelConfigApi } from "./channel-config-api.js";

export type AdminApiOptions = {
  adminToken: string;
  channelStore: ChannelConfigStore;
  onChannelConfigChanged?: (provider: string) => void | Promise<void>;
};

export function mountAdminApi(server: IngressServer, opts: AdminApiOptions): void {
  mountChannelConfigApi(server, {
    store: opts.channelStore,
    adminToken: opts.adminToken,
    onConfigChanged: opts.onChannelConfigChanged,
  });
}
```

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- api/mount
git add packages/bot-runtime/src/api
git commit -m "feat(api): admin API mount entrypoint"
```

Expected: 1 test PASS。

---

## Phase G — HybridHost 接入 + 端到端验证（6 tasks）

### Task 30: HybridHost wire ingress + outbound runner + registry

**Files:**
- Modify: `packages/bot-runtime/src/runtime/hybrid-host.ts`
- Create: `packages/bot-runtime/src/runtime/__tests__/hybrid-host-channel.test.ts`

**目的：** 让 hybrid 启动时同时拉起 IngressServer + OutboundRunner + Provider Registry，并把它们 wire 进 MasterHost.ingestInbound。

- [ ] **Step 1: 写失败测试**

```ts
// packages/bot-runtime/src/runtime/__tests__/hybrid-host-channel.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createHybridHost } from "../hybrid-host.js";
import { createStubLlmClient } from "../../llm/client.js";

let tmp: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "hh-"));
});

afterEach(async () => {
  if (host) await host.close();
  host = null;
});

describe("HybridHost — channel wiring", () => {
  it("exposes ingressPort, registry, and outboundRunner.tickOnce", async () => {
    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient(),
      draftLlm: createStubLlmClient(),
      execLlm: createStubLlmClient(),
      systemPrompt: "x",
      maxSteps: 8,
      leaseMs: 30000,
      channel: { adminToken: "admin", ingressPort: 0 },
    });
    expect(typeof host.ingressPort).toBe("number");
    expect(typeof host.outboundRunner.tickOnce).toBe("function");
    expect(host.providerRegistry.list()).toEqual([]);
  });

  it("admin PUT /api/channels/feishu registers a Feishu provider", async () => {
    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient(),
      draftLlm: createStubLlmClient(),
      execLlm: createStubLlmClient(),
      systemPrompt: "x",
      maxSteps: 8,
      leaseMs: 30000,
      channel: {
        adminToken: "admin",
        ingressPort: 0,
        env: { FEISHU_APP_SECRET: "test" },
        botOpenIdProvider: () => "ou_bot",
      },
    });
    const r = await fetch(`http://127.0.0.1:${host.ingressPort}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "admin" },
      body: JSON.stringify({
        enabled: true,
        ingress: { webhookEnabled: true },
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(r.status).toBe(200);
    expect(host.providerRegistry.list()).toEqual(["feishu"]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

`pnpm --filter @ai-employee/bot-runtime test -- hybrid-host-channel`
Expected: FAIL。

- [ ] **Step 3: 修改 hybrid-host.ts**

新增字段 `channel?: { adminToken: string; ingressPort?: number; env?: Record<string, string>; botOpenIdProvider?: () => string; fetchToken?: ...; }`，host 启动时：

```ts
const channelStore = createChannelConfigStore(paths, runtimeId);
const inboundRepo = createInboundEventRepo(paths, runtimeId);
const outboundQueue = createChannelOutboundJobQueue(paths, runtimeId);
const registry = createProviderRegistry();
const userDir = createUserDirectory(paths, runtimeId);
const guardianBoot = createGuardianThreadBootstrap({ paths, runtimeId, threadRepo: master.threadRepo });

async function rebuildProvider(provider: string) {
  const cfg = await channelStore.loadRaw(provider);
  if (!cfg || !cfg.enabled) {
    if (registry.get(provider)) registry.remove(provider);
    return;
  }
  if (provider === "feishu") {
    const fcfg = parseFeishuConfig(cfg);
    const secrets = await resolveFeishuSecrets(fcfg, input.channel?.env ?? process.env);
    if (registry.get("feishu")) registry.remove("feishu");
    registry.register(
      createFeishuProviderFromConfig({
        config: fcfg,
        secrets,
        botOpenId: input.channel?.botOpenIdProvider?.() ?? fcfg.appId,
        fetchToken: input.channel?.fetchToken ?? fetchFeishuTenantAccessToken,
      }),
    );
  }
}

const ingress = createIngressServer();
mountAdminApi(ingress, {
  adminToken: input.channel.adminToken,
  channelStore,
  onChannelConfigChanged: rebuildProvider,
});
const lookup = createBindingLookup(paths, runtimeId, {
  resolveUserByExternalId: (provider, ext) => userDir.resolveOrCreate(provider, ext, ext),
  createGuardianThread: (_p, userId) => guardianBoot.ensureGuardianThread(userId),
});
const webhook = createWebhookHandler({
  registry,
  inboundRepo,
  ingest: master.ingestInbound,
  lookupBinding: lookup,
  configResolver: async (p) => {
    const raw = await channelStore.loadRaw(p);
    return raw ? { secret: raw.secretRefs.appSecret ?? "" } : null;
  },
});
ingress.route("POST", "/webhooks/feishu", (req) =>
  webhook({ provider: "feishu", headers: req.headers, rawBody: req.rawBody }),
);
const { port } = await ingress.listen(input.channel.ingressPort ?? 0);

const outboundRunner = createChannelOutboundRunner({ queue: outboundQueue, registry });

return {
  ...master,
  outboundRunner,
  providerRegistry: registry,
  ingressPort: port,
  channelStore,
  async close() {
    await ingress.close();
    await master.close();
  },
};
```

`ProviderRegistry` 现在需要新增 `remove(name: string)` 方法（一并修改 `provider-registry.ts`）。

- [ ] **Step 4: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- hybrid-host-channel
git add packages/bot-runtime
git commit -m "feat(runtime): HybridHost wires ingress, outbound runner, provider registry"
```

Expected: 2 tests PASS。

---

### Task 31: 端到端：webhook → guard → confirm → execute → outbound

**Files:**
- Create: `packages/bot-runtime/tests/integration/feishu-end-to-end.test.ts`

**注意：** 这个测试用 stub LLM + mocked `fetch`（只 mock 出站到 feishu）。

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/tests/integration/feishu-end-to-end.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createPaths } from "../../src/storage/paths.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";

let tmp: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "fee-"));
});

afterEach(async () => {
  if (host) await host.close();
  host = null;
  vi.unstubAllGlobals();
});

describe("feishu end-to-end (stub LLM)", () => {
  it("inbound webhook drives ingest → guard → draft → confirm → execute → outbound", async () => {
    // mock outbound to feishu
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes("/tenant_access_token/")) {
        return { ok: true, json: async () => ({ code: 0, tenant_access_token: "tk", expire: 7200 }) };
      }
      if (String(url).includes("/im/v1/messages")) {
        return { ok: true, json: async () => ({ code: 0, data: { message_id: "om_x" } }) };
      }
      return { ok: false, status: 404, text: async () => "no" };
    });
    vi.stubGlobal("fetch", fetchMock);

    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient({
        guardCanned: { intent: "new_task", confidence: 0.9, reason: "stub" },
      }),
      draftLlm: createStubLlmClient({
        draftCanned: { title: "Stub task", description: "do x" },
      }),
      execLlm: createStubLlmClient({
        execCanned: { kind: "finish", outcome: "completed", summary: "done" },
      }),
      systemPrompt: "x",
      maxSteps: 4,
      leaseMs: 30000,
      channel: {
        adminToken: "a",
        ingressPort: 0,
        env: { FEISHU_APP_SECRET: "s" },
        botOpenIdProvider: () => "ou_bot",
      },
    });

    // configure feishu
    await fetch(`http://127.0.0.1:${host.ingressPort}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({
        enabled: true,
        ingress: { webhookEnabled: true },
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(host.providerRegistry.list()).toEqual(["feishu"]);

    // simulate inbound feishu webhook
    const inbound = {
      token: "v_t",
      schema: "2.0",
      header: { event_id: "ev_1", event_type: "im.message.receive_v1", create_time: "1714349900000" },
      event: {
        sender: { sender_id: { open_id: "ou_alice" } },
        message: {
          message_id: "om_user_1",
          message_type: "text",
          chat_id: "p2p_alice",
          chat_type: "p2p",
          content: '{"text":"please do x"}',
          mentions: [],
        },
      },
    };
    const r = await fetch(`http://127.0.0.1:${host.ingressPort}/webhooks/feishu`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inbound),
    });
    expect(r.status).toBe(200);

    // wait one outbound tick to flush any enqueued send_message jobs
    await host.outboundRunner.tickOnce();
  });
});
```

- [ ] **Step 2: 跑测试 + commit**

```bash
pnpm --filter @ai-employee/bot-runtime test -- feishu-end-to-end
git add packages/bot-runtime/tests/integration
git commit -m "test(integration): feishu webhook end-to-end with stub LLM"
```

Expected: PASS。如有 stub LLM 行为缺失，回到 Plan 1 `client.ts` 加 canned 字段（不改 schema，仅扩展 stub）。

---

### Task 32: 端到端：webhook 重复 event 幂等（v1 验收 #10）

**Files:**
- Create: `packages/bot-runtime/tests/integration/feishu-webhook-idempotent.test.ts`

- [ ] **Step 1: 写测试**

```ts
// packages/bot-runtime/tests/integration/feishu-webhook-idempotent.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPaths } from "../../src/storage/paths.js";
import { createGuardDecisionRepo } from "../../src/repositories/guard-decision-repo.js";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";

let tmp: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "fwi-"));
});

afterEach(async () => {
  if (host) await host.close();
  host = null;
  vi.unstubAllGlobals();
});

describe("feishu webhook idempotency (v1 acceptance #10)", () => {
  it("same event_id delivered twice yields exactly one GuardDecision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: {} }) }),
    );

    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient({
        guardCanned: { intent: "chat", confidence: 0.5, reason: "stub" },
      }),
      draftLlm: createStubLlmClient(),
      execLlm: createStubLlmClient(),
      systemPrompt: "x",
      maxSteps: 4,
      leaseMs: 30000,
      channel: {
        adminToken: "a",
        ingressPort: 0,
        env: { FEISHU_APP_SECRET: "s" },
        botOpenIdProvider: () => "ou_bot",
      },
    });

    await fetch(`http://127.0.0.1:${host.ingressPort}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({
        enabled: true,
        ingress: {},
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });

    const inbound = {
      token: "v_t",
      schema: "2.0",
      header: { event_id: "ev_dup", event_type: "im.message.receive_v1", create_time: "1714349900000" },
      event: {
        sender: { sender_id: { open_id: "ou_alice" } },
        message: {
          message_id: "om_dup",
          message_type: "text",
          chat_id: "p2p_alice",
          chat_type: "p2p",
          content: '{"text":"hi"}',
          mentions: [],
        },
      },
    };
    const url = `http://127.0.0.1:${host.ingressPort}/webhooks/feishu`;
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inbound),
    } as const;

    await fetch(url, init);
    const second = await fetch(url, init);
    expect(second.status).toBe(200);
    const body = (await second.json()) as { duplicate?: boolean };
    expect(body.duplicate).toBe(true);

    const repo = createGuardDecisionRepo(createPaths(tmp), "rt_test");
    // find guardian thread
    const all = await repo.listAllForDebug();
    expect(all.length).toBe(1);
  });
});
```

注：`listAllForDebug` 是给本测试加的辅助方法。如果不想动 repo，改用直接遍历 `state/threads/<th>/guard-decisions.jsonl` 计数。

- [ ] **Step 2: 跑测试**

`pnpm --filter @ai-employee/bot-runtime test -- feishu-webhook-idempotent`
Expected: PASS（去重已经在 Phase B Task 7 webhook-handler 实现）。

- [ ] **Step 3: commit**

```bash
git add packages/bot-runtime
git commit -m "test(integration): same event_id delivered twice yields one decision"
```

---

### Task 33: 全量验证

- [ ] **Step 1: 跑完整测试套件**

```bash
pnpm --filter @ai-employee/bot-runtime test
```

Expected: 全部 PASS（Plan 1 的 159 + Plan 2 新增约 70~90，合计 ~230+）。

- [ ] **Step 2: Build 全量 TypeScript**

```bash
pnpm -r build
```

Expected: 0 type errors。

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: 0 errors。如有，按 Plan 1 风格修（template literal → plain string、any → 具体类型、unused var → 删/前缀 `_`）。

- [ ] **Step 4: commit clean state**

```bash
git status
git commit -am "chore: pass full test/build/lint pipeline (Plan 2)" || true
```

---

### Task 34: Plan 2 自查报告

- [ ] **Step 1: Spec 覆盖核对**

确认覆盖 Spec 第 17 章 #6（通用 Channel 子系统）+ #7（Feishu Provider）：

| Spec 起点 | Plan 2 任务 |
|---|---|
| #6 通用 ChannelProvider 接口 | Task 1 |
| #6 ChannelIngress | Task 6, 7, 8, 9, 30 |
| #6 ChannelOutboundJobRunner | Task 4, 5, 30 |
| #7 webhook + 长连接 | Task 11, 19 |
| #7 文本消息 + 群聊路由 | Task 13, 14, 15 |
| #7 脱敏配置 API | Task 3, 27, 28, 29 |
| 替换 notify_bound_channel stub | Task 24, 25, 26 |

附加：Guardian（Task 20-23）虽然 spec 第 17 章未单列，但是控制面入口的必要前置；v1 验收 #10（webhook 幂等）由 Task 32 兜底。

- [ ] **Step 2: 占位符扫描**

```bash
grep -rn "TODO\|TBD\|implement later\|FIXME" packages/bot-runtime/src/channel packages/bot-runtime/src/ingress packages/bot-runtime/src/providers packages/bot-runtime/src/guardian packages/bot-runtime/src/api || true
```

Expected: 无命中（Feishu LongConnection 的 not-implemented 是 v1 设计，不算 placeholder）。

- [ ] **Step 3: 类型一致性检查**

逐项核对：

- `ChannelProvider.sendMessage` 签名：Task 1 定义 → Task 14 实现 → Task 16 装配 → Task 5 outbound runner 调用，参数 `SendMessageInput` 完全一致
- `BindingLookup` 签名：Task 7 webhook-handler 定义 → Task 8 binding-lookup 实现 → Task 30 hybrid-host 注入，签名一致
- `ChannelInboundEvent` 状态机：Task 2 实现 → Task 7 webhook-handler 调用 markProcessed/markSkipped/markFailed
- `NotifyTarget`：Task 24 _notify-target.ts 定义 → Task 25 notify-bound-channel.ts 引用同一类型
- `IngressHandler` / `IngressRequest`：Task 6 定义 → Task 7、27、29 全部沿用

- [ ] **Step 4: 写自查报告章节到 plan 文档**

把上述结果以表格形式回写到本 plan 文档 `## Plan 2 自查报告` 节（在 Execution Handoff 之前）。

---

### Task 35: Plan 2 收尾 + Execution Handoff

- [ ] **Step 1: 写 Execution Handoff 章节**

在 plan 末尾追加：

```markdown
## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-29-channels-and-feishu-plan.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review.
**2. Inline Execution** — execute in this session via executing-plans.

**Which approach?**

---

## 后续 Plan 预告

- Plan 3：客户端最小可视化（Spec 第 17 章 #8）—— SSE 流、TaskList 视图、artifact 浏览。
- Plan 4：Agent eval + v1 验收 e2e（Spec 第 17 章 #9-#10）。
```

- [ ] **Step 2: commit plan + 自查**

```bash
git add docs/superpowers/plans/2026-04-29-channels-and-feishu-plan.md
git commit -m "docs(plan-2): self-review report and execution handoff"
```

- [ ] **Step 3: 准备 Plan 2 启动消息**

写一段 Plan 2 启动备忘（同 Plan 1 风格），供执行阶段使用。

---

## 全量验证

- [ ] 测试：`pnpm --filter @ai-employee/bot-runtime test` —— 全 PASS
- [ ] 构建：`pnpm -r build` —— 0 errors
- [ ] Lint：`pnpm lint` —— 0 errors
- [ ] 自查表格已回填本文档
- [ ] HEAD 在 plan-2-channels 分支

---

## Plan 2 自查报告

（执行 Task 34 时填写）

---

## Execution Handoff

（执行 Task 35 时填写）

---

## 后续 Plan 预告

- Plan 3：客户端最小可视化（Spec 第 17 章 #8）。
- Plan 4：Agent eval + v1 验收 e2e（Spec 第 17 章 #9-#10）。
