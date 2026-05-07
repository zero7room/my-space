# 本地启动 & 人工验证手册

这份文档指导你从零把 AI Workflow System V1 跑起来，用浏览器 + curl 逐条验证 `init/requirement.md §10.1` 的 69 项验收。

---

## 0 · 前置依赖

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | ≥ 22 | `node -v` |
| pnpm | ≥ 10 | `corepack enable && corepack prepare pnpm@latest --activate` |
| curl | 任意 | 命令行验证 |
| 浏览器 | 任意 | Chrome / Firefox / Safari |
| （可选）Docker | ≥ 24 | Prometheus + Grafana |
| （可选）Anthropic / OpenAI key | — | 真实 LLM，否则走启发式 fallback |

---

## 1 · 克隆 & 安装

```bash
cd /Users/eeo/code/my-space
pnpm install
pnpm -r build
pnpm verify          # 180+ 单测 + 5 个 eval；绿了再继续
```

期望输出最后一行 `pnpm verify` 退出码 0。

---

## 2 · 配置环境变量

```bash
cp .env.example .env
```

**必填** — 已默认好，只要保证下列一致：

```env
RUNTIME_ID=local-dev
PORT=4000
LOCAL_USER_TOKENS=usr_dev00000000000000000:dev-token
NEXT_PUBLIC_RUNTIME_URL=http://localhost:4000
NEXT_PUBLIC_BEARER=dev-token
```

**LLM 可选** — 用环境变量三选一：

| 模式 | 设置 |
|---|---|
| **Anthropic Claude**（推荐） | `LLM_PROVIDER=anthropic`、`LLM_API_KEY=sk-ant-...`、`LLM_MODEL=claude-opus-4-7` |
| **OpenAI** | `LLM_PROVIDER=openai`、`LLM_API_KEY=sk-...`、`LLM_MODEL=gpt-4.1`（可换 Chat Completions 兼容模型） |
| **离线启发式**（默认） | 留空或 `LLM_PROVIDER=heuristic` — 关键词分类，零依赖 |

自定义网关 / 代理 / Azure：`LLM_BASE_URL=https://your-proxy/v1`。超时：`LLM_TIMEOUT_MS=15000`。

**Feishu 可选** — 只在需要验收 #10 / #53 的真实 webhook HMAC 时配置：

```env
FEISHU_VERIFICATION_TOKEN=<lark 应用凭证>
FEISHU_ENCRYPT_KEY=<lark 加密 key>
```

加载到 shell：`set -a && source .env && set +a`

---

## 3 · 种 dev 用户

```bash
node tooling/scripts/seed-dev-user.mjs
```

应输出 `ok: seeded user usr_dev00000000000000000 ...`。这在 `data/instances/local-dev/state/users/` 建好用户文件；没这一步 `Authorization: Bearer dev-token` 会 401。

---

## 4 · 启动服务

**终端 A** — bot-runtime：

```bash
set -a && source .env && set +a
pnpm --filter @ai-workflow/bot-runtime dev
```

期望日志末尾 `bot-runtime listening on 0.0.0.0:4000 (runtimeId=local-dev)`。

**终端 B** — web 客户端：

```bash
set -a && source .env && set +a
pnpm --filter @ai-workflow/web dev
```

期望 `▲ Next.js ... - Local: http://localhost:3000`。

---

## 5 · 快速 smoke（可选）

```bash
./tooling/scripts/smoke.sh
```

串起 health → whoami → create thread → list → post message → metrics。每步都会打印服务端响应，全部 200 即 smoke 通过。

---

## 6 · 浏览器验证路径

访问 `http://localhost:3000`。

### 基础闭环

| # | 操作 | 预期 |
|---|---|---|
| 1 | 点 **Threads** | 列表（首次为空；smoke 跑过会有 1 条） |
| 2 | `./smoke.sh` 建一个 thread，浏览器刷新 | 看到一条 thread 记录 |
| 3 | 点 thread → 进入详情页 | 顶部显示 `SSE: streaming`，空事件列表 |
| 4 | 在输入框发送 `draft a marketing plan` | 事件流里滚出 `task_confirmed` 等（LLM 启用时） |
| 5 | 回 **Threads** | 再建几条 thread，验证 owner-first |
| 6 | 点 **Policies** | 列表为空（未配置），页面应正常 |
| 7 | 点 **Channels** | 列表为空，页面应正常 |

### 任务生命周期（API + UI 配合）

```bash
# 拿到一个 thread id
THREAD=$(curl -s -H "Authorization: Bearer dev-token" \
  http://localhost:4000/api/threads | python3 -c 'import json,sys;print(json.load(sys.stdin)["threads"][0]["id"])')
echo "$THREAD"

# 手工构造一个 draft task（跳过 MessageGuard 直接建 task，便于验证操作按钮）
TASK=$(curl -sX POST -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"text":"please draft a marketing plan"}' \
  http://localhost:4000/api/threads/$THREAD/messages)
echo "$TASK"
```

（v1 的自动 guard→draft 链路需要 ThreadLoop worker；目前浏览器里如果你看到 `task_drafted` 事件滚出，说明 LLM 模式已识别意图。否则直接用以下方式在已有 task 上操作。）

找到一个已有 task 的详情页：`http://localhost:3000/tasks/<taskId>`。

| # | 验收 | 操作 | 期望 |
|---|---|---|---|
| #3 / #4 | draft + owner confirm | 点 **Confirm** 按钮（task 必须处于 `draft`） | 状态 `draft → confirmed`，事件流出现 `task_confirmed` |
| #7 / #40 | Plan revision + retry reset | 侧边 Plan 面板点 revisions | 看到 revision 列表 + 每条 reason |
| #14 | cancel 转移合法性 | 点 **Cancel**（非终态时） | `task_cancelled` 事件；completed / cancelled 的 task 按钮禁用 |
| #32 | blocked 面板三动作 | 让 task 走到 `blocked{awaiting_user_action}` 后在 UI 试 retry/skip/cancel 三个按钮 | 只有合法组合可点 |
| #52 | retry-history endpoint | 滚到页面底部 **Retry history** 表 | 有历史时按时序显示 attempt / failureClass / summary |
| #57 – #69 | Teams 面板 | 展开 **Teams** 列表 | 看到 team、work items（completed/claimed/available 分桶）、teammates |

---

## 7 · 强约束 / SSE / 观测验证

### #9 · 重启不丢数据

```bash
# 在终端 A 按 Ctrl-C 停掉 bot-runtime
pnpm --filter @ai-workflow/bot-runtime dev    # 再起一次
# 回到浏览器刷新 /threads — 列表还在
```

### #11 · kill -9 + 恢复

```bash
pkill -9 -f bot-runtime/dist/index.js || pkill -9 -f 'tsx src/index.ts'
pnpm --filter @ai-workflow/bot-runtime dev
tail data/instances/local-dev/state/_diagnostics/recovery.jsonl   # 应有 runtime_recovery_scan_completed
```

所有 `running` 的 task 会被标回 `blocked{non_idempotent_tool_in_flight}`，等你人工决定。

### #10 · Webhook 幂等

```bash
# 送两次同一个 event_id
for i in 1 2; do
  curl -sX POST http://localhost:4000/api/channels/feishu/webhook \
    -H 'Content-Type: application/json' \
    -d '{"token":"","header":{"event_id":"E1"},"event":{"message":{"chat_id":"oc_x","message_id":"m1","content":"{\"text\":\"hi\"}"}}}'
done
ls data/instances/local-dev/state/webhooks/feishu/     # E1.json 只有一个
```

### #12 · CriticalNodePolicy 热加载

```bash
curl -sX POST -H "Authorization: Bearer dev-token" -H 'Content-Type: application/json' \
  -d '{"scope":"global","matcher":{"kind":"tool","toolName":"bash"},"action":"require_approval","ownerUserId":"usr_dev00000000000000000","enabled":true}' \
  http://localhost:4000/api/critical-node-policies
# 不用重启，下一次 bash 工具调用即生效
```

### #19 / #55 · Artifact 一致性

```bash
# 找一个 artifact 记录，篡改磁盘上的文件内容，重启 runtime
echo "tampered" > data/instances/local-dev/state/threads/<th>/tasks/<ta>/user-data/outputs/a.txt
# 重启后看 _diagnostics/recovery.jsonl 里的 artifact_consistency_warning
```

### #41 · SSE ack 超时

```bash
# 在浏览器打开 thread 详情页（SSE 建立）
# 不做任何事等 30 秒
tail -n 50 data/instances/local-dev/state/threads/<th>/tasks/<ta>/events.jsonl \
  | grep sse_ack_missing
```

或直接观察 `/api/runtime/metrics` 里的 `ai_sse_ack_missing_total`、`ai_sse_replay_emitted_total`。

### #44 · events.jsonl rotation

```bash
# 临时把阈值拧小
export RUNTIME_EVENTS_JSONL_MAX_BYTES=1024
# 重启 runtime，往 thread 打够多消息
ls data/instances/local-dev/state/threads/<th>/tasks/<ta>/events-archive/
curl -s http://localhost:4000/api/runtime/metrics | grep ai_events_jsonl_rotated_total
```

### #45 · PII redaction

```bash
# 发一条含邮箱 / 手机号的消息，检查 transcript 不包含原文
curl -sX POST -H "Authorization: Bearer dev-token" -H 'Content-Type: application/json' \
  -d '{"text":"call alice@example.com or +1 415 555 0100"}' \
  http://localhost:4000/api/threads/$THREAD/messages
grep -o 'redacted:[a-z_]*' data/instances/local-dev/state/threads/$THREAD/transcript.jsonl
```

### #50 · Grafana 仪表盘

```bash
docker compose -f tooling/docker-compose.local.yml up -d prometheus grafana
# http://localhost:9090 Prometheus UI
# http://localhost:3001  Grafana (admin / admin)；dashboard 自动从 ops/grafana 加载
```

### #53 · Webhook dedupe 24h TTL

跑一段时间后：

```bash
ls -la data/instances/local-dev/state/webhooks/feishu/       # 新文件
ls -la data/instances/local-dev/state/jobs/dedupe/            # 老条目 24h 内清理
```

---

## 8 · 常见问题

| 症状 | 排查 |
|---|---|
| 401 Unauthorized | `LOCAL_USER_TOKENS` 没导入 shell / 没 `seed-dev-user.mjs` |
| 403 Forbidden | token 绑定的 userId 不是该资源的 ownerUserId |
| `pnpm install` 拉包慢 | 配 `npm_config_registry=https://registry.npmmirror.com` |
| Web 页面报 `Could not load ...` | `NEXT_PUBLIC_RUNTIME_URL` / `NEXT_PUBLIC_BEARER` 没设或不对 |
| 事件流一直不滚 | 看 bot-runtime 终端是否接到 POST；web 终端是否建立了 SSE 连接（Network → EventSource） |
| LLM 分类不工作 | 默认启发式；要真实模型必须 `LLM_PROVIDER=anthropic` + `LLM_API_KEY=...` |

---

## 9 · 一键重置（开发中把数据拍平）

```bash
pkill -f 'bot-runtime|next dev' 2>/dev/null || true
rm -rf data/instances/local-dev
node tooling/scripts/seed-dev-user.mjs
```

`data/instances/<runtimeId>/` 就是**全部**持久化；删掉它，recovery scan 会自己建空白树。

---

## 10 · 参考

- 设计：`init/design.md`
- 验收：`init/requirement.md` §10.1（1–69 项）
- 验收对账：`docs/superpowers/implementation-memory/acceptance-matrix.md`
- 运维 runbook：`docs/runbooks/operations.md`
- 架构决策：`docs/superpowers/implementation-memory/decisions.md`
