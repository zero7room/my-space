# my-space Gap-Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 补齐 requirement.md + design.md 要求但现行代码缺失或偏离的所有条目（客户端 UI 形态、后端动作端点、schema 迁移、skill loader、eval 样本量、runbook、grafana 仪表盘、端到端演示）。

**Architecture:** 单 runtime hybrid（不变）；客户端重写为工作台形态（Sidebar + Header + 中央 Chat + 右侧 TaskDrawer），保留既有 URL 作为 drawer 深链触发。后端补缺口 + 回归测试覆盖所有 🟡 条目。

**Tech Stack:** Next.js 15 App Router、Tailwind v4、Fastify、Zod、Vitest、prom-client。

**Authority:** `/Users/eeo/code/my-space/init/requirement.md` + `/Users/eeo/code/my-space/init/design.md`。`reference/xuedian` 仅作形态参考（色系、圆角、抽屉交互）。

---

## 对账矩阵（精简索引）

C1-C25 客户端 UI；B1-B24 后端 API/契约；T1-T8 Teams；E1-E5 Evals；O1-O4 运维；V1-V10 视觉；S1-S5 安全/一致性。完整矩阵见 2026-05-07 session 对账。

---

## P0：客户端 UI 补齐（权威：requirement §7 + design §3 + 验收 32/41/42/44/55/68）

### P0-A Foundation

**Files:**
- Modify: `apps/web/package.json`（加 tailwindcss@^4、@tailwindcss/postcss、postcss、clsx、tailwind-merge、zustand）
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/app/globals.css`（design tokens，warm beige 方案对齐 design §7，Tailwind v4 语法）
- Modify: `apps/web/app/layout.tsx`（挂 globals.css，声明 zh 语言、字体）
- Create: `apps/web/components/workbench/WorkbenchShell.tsx`（三栏 shell）
- Create: `apps/web/components/workbench/DegradedBanner.tsx`（SSE degraded 状态）
- Create: `apps/web/lib/stores/conversations.ts`、`sessions.ts`、`plans.ts`（zustand / external store）
- Create: `apps/web/lib/sse-client.ts`（统一 SSE + ack 心跳 + replay/reload handling）

- [ ] 1. 加依赖 `pnpm -F web add -E tailwindcss@4 @tailwindcss/postcss postcss clsx tailwind-merge zustand`
- [ ] 2. 写 `postcss.config.mjs` → `{ plugins: ['@tailwindcss/postcss'] }`
- [ ] 3. 写 `app/globals.css`：`@import "tailwindcss";` + `:root { --background:#f6f0e6; --foreground:#2e2823; --surface:#fffaf3; --surface-strong:#f5ebe0; --surface-raised:rgba(255,255,255,0.86); --border:rgba(122,92,61,0.16); --muted:#8d7865; --accent:#d88f55; --accent-soft:rgba(216,143,85,0.14); --success:#3c8c63; --warning:#c99335; --danger:#bc5a4c; }` + body gradient
- [ ] 4. `app/layout.tsx`：引入 `./globals.css`，`<html lang="zh">`，移除黑底内联样式
- [ ] 5. `WorkbenchShell`：`<div className="flex h-dvh"><aside w-64/><main flex-1><header/>{children}</main><TaskDrawer/></div>`
- [ ] 6. `DegradedBanner`：读 sseStore.degraded，固定顶部
- [ ] 7. SSE client：`connect(threadId)` + 10s ack 心跳 + 监听 `sse_replay_emitted` / `sse_replay_truncated` / `reload_required` → 更新 store
- [ ] 8. Zustand stores：conversations（thread 列表）、tasks（task 列表 + blocked info）、teams（当前 task 的 team 快照）
- [ ] 9. typecheck + lint 通过；提交

### P0-B Components（6 并行 agent）

#### B1 Sidebar
- Create: `components/workbench/Sidebar.tsx`
- 内容：会话列表（`api.listThreads`）+ 展开/收起（w-64 ↔ w-20）+ `+ 新对话` + `飞书配置` 按钮（C1, C24, V5）
- 收起模式：图标 + 编号

#### B2 ChatWindow
- Create: `components/workbench/ChatWindow.tsx`、`components/workbench/MessageBubble.tsx`、`components/workbench/GuardDecisionBadge.tsx`
- 消息气泡（user `#f2dfcb` 右，assistant `var(--surface)` 左）
- GuardDecision intent + shortCircuited + confidence 徽章
- 输入框：textarea auto-grow + Enter 发送 / Shift+Enter 换行 + Stop 按钮
- reload_required 事件清空 store + 重新 fetch

#### B3 TaskDrawer + TaskList + TaskDetail + PlanProgressSection + PlanPanel + ChangeHistoryPanel + ArtifactPanel
- Create: `components/workbench/TaskDrawer.tsx`、`TaskListPanel.tsx`、`TaskDetailPanel.tsx`、`TaskDetailTabs.tsx`、`PlanProgressSection.tsx`、`ChangeHistoryPanel.tsx`、`ArtifactPanel.tsx`
- Tabs: 摘要/计划/差异/日志（V7）
- Plan 步骤显示状态徽章（completed/in_progress/blocked/failed/skipped）
- 变更历史时间线：PlanRevision 逆序 + 关联 ChangeRecord + 归档 artifact 入口
- ArtifactPanel：active artifact 列表 + 预览按钮 + 下载 + sha256 漂移红框
- 抽屉宽度 `w-[min(46vw,560px)] min-w-[420px]`

#### B4 Modals
- Create: `components/workbench/CriticalNodeApprovalModal.tsx`、`PlanConfirmModal.tsx`、`ChangeConfirmModal.tsx`、`ToastProvider.tsx`
- 关键节点：显示 matcher.kind + 细节 + approve/reject
- Plan 确认：展示步骤 + 确认/放弃
- 变更确认：显示新旧 PlanRevision diff 概要 + 归档 artifact 列表
- Toast：403 `not_owner` → "仅任务发起人可操作"；409 → "当前状态不允许此操作"

#### B5 TeamPanel 重写
- Modify: `components/TeamPanel.tsx` → 迁移至 `components/workbench/TeamPanel.tsx`
- RosterGrid：每 slot 一格（persona、当前状态、正在处理的 workItemId）
- WorkItemSegments：available/claimed/completed/failed 四段
- MessageBusFeed：按 from/to/kind 过滤
- PerTeammateEventsDrawer：展开查看 teammate events
- Approve/Reject 按钮（teammate_critical_node_hit 时显现）
- 终止按钮（owner only，级联 cancel）

#### B6 ChannelsDrawer + FeishuConfigSheet + BindingStatusBadge
- Create: `components/workbench/ChannelsDrawer.tsx`、`FeishuConfigSheet.tsx`、`BindingStatusBadge.tsx`
- Sheet 字段：enabled toggle、botAppId、botAppSecret（仅展示 `hasSecret`，重新输入覆盖）、botSigningSecret、botName、operatorOpenId
- GET /channels/configs 只返 `hasSecret` 布尔（后端确认）
- Binding 5 态视觉：binding/bound/unbinding/failed/disabled
- 未配置 / 未绑定 / 绑定中 CTA

### P0-C Polish

- TaskActions 改造：按 task_blocked.suggestedActions 启用按钮（retry_exhausted 仅 Cancel；awaiting_user_action 全开）
- 错误处理：读 `error.reason` (`not_owner`/`invalid_state`/`terminal_state`) 映射 Toast
- /threads、/threads/[id]、/tasks/[id]、/policies、/channels 页保留，内部改为调用工作台组件（drawer 触发 open state）

### P0-Critic
- 对照 requirement §7 L527-548 + 验收 32/41/42/68 逐条检查；对照 xuedian 形态校验色、圆角、hover、spacing
- 产出缺口单 → 修复

---

## P1：后端必做缺口

### P1-A task skip 端点 + suggestedActions 联动（B5）
- Create: `apps/bot-runtime/src/api/routes/task-skip.ts` 或 `tasks.ts` 内新增
- 逻辑：仅 `blocked` 且 `blockedReason ∈ {awaiting_user_action, non_idempotent_tool_in_flight}` 可 skip；标当前 active PlanStep `skipped` → 写 `task_block_resolved{action:"skip"}` → blocked → queued
- 两阶段校验：owner → status；deny 事件 + counter

### P1-B migrate_task_retry_state + schemaVersion gate（B11）
- Create: `apps/bot-runtime/src/runtime/migration/migrate_task_retry_state.ts`
- 启动时扫 tasks/*/task.json：schemaVersion 缺 / =1 → 迁移 → 写 task_schema_migrated 事件
- master 重试调度器：schemaVersion<2 skip
- 单测：迁移成功 / 迁移失败保持原状并标 migration_pending

### P1-C Skill Loader + skills-cache.json fallback（B22）
- Create: `apps/bot-runtime/src/skills/loader.ts`、`state/_diagnostics/skills-cache.json` 管理
- 按文件粒度 schema 校验失败独立隔离；写 skills_load_error；5 次同一 skill 失败 → fallback cache
- GET /api/skills/load-status 返回每 skill 来源（disk/cache/failed）

### P1-D Runbook + Grafana JSON（O3, O4）
- Create: `docs/runbooks/retry-troubleshooting.md`（5 SOP）
- Create: `ops/grafana/retry-dashboard.json`（5 行面板 + 3 告警）

### P1-Critic 对照验收 29/30/34/50/51/56 + 32/42 逐条检查

---

## P2：后端回归验证（所有 🟡 → ✅）

3 个并行审计域：
- **Retry/Recovery**：B11-B14、S3、验收 21-40
- **Teams**：T1-T7、验收 57-69
- **SSE/Events/Channels**：B2/B7-B10/B23/B24、验收 41/44/45/53/54/55

每域产出：
1. 逐条验收清单（需求行号 → 代码位置 → 单测 / e2e 位置）
2. 未覆盖或缺陷 → 补实现 + 补测
3. 全部绿后交给 critic

### P2-Critic

---

## P3：Eval 数据集扩充

### P3-A FailureClass 200（4×50）
- 扩 `tests/evals/datasets/failure-class.jsonl`
- 新增指标：人工 vs 自动一致率（≥90%）、micro-F1（≥0.85）
- 阈值失败阻塞发布

### P3-B TeamOrchestration 150（3×50）
- 扩 `tests/evals/datasets/team-orchestration.jsonl`
- 指标：team 二分类 recall≥0.85 precision≥0.75；角色分配 micro-F1≥0.7

### P3-Critic 校验分布、指标、阈值

---

## P4：E2E 演示脚本（验收 10.1 §1-9）

- Create: `tooling/scripts/demo-e2e.sh` 或 Vitest e2e
- 覆盖：对话 → 意图 → 草稿 → 确认 → 执行 → 变更（写 ChangeRecord + 归档）→ 完成 → 恢复（kill -9）

---

## Product Review & Final Regression

- Product Review agent：从用户视角走一遍，提改进单
- Final Regression agent：`pnpm -w lint && pnpm -w typecheck && pnpm -w test && pnpm -F bot-runtime test:evals && 启动 bot-runtime + web、跑 smoke.sh + demo-e2e.sh`
- 输出最终验收报告 + 对账矩阵完整状态

---

## 每阶段完成后必做

1. 主 session 更新对账矩阵（只留状态摘要，不留 agent transcript）
2. Critic agent 批判 review
3. 问题回修后再进下一阶段
