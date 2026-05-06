# AI 自动工作流系统需求文档

版本：final-v001 独立整理版
日期:2026-04-30
状态：最终整理

本文档为独立交付版，除配套 `design.md` 外不依赖仓库中的其它文件。

---

## 0. 阅读指南

- 第 1–3 章：背景、定位、参考边界。
- 第 4 章：核心概念（User/Thread/Task/Plan/Skill/Channel/MessageGuard/CriticalNode）。
- 第 5 章：核心工作流（消息进入、生成任务、执行、变更、关键节点、完成）。
- 第 6 章：产品规则（身份、自治、确认、并发、变更、绑定、消息守卫）。
- 第 7 章：客户端要求。
- 第 8 章：持久化要求。
- 第 9 章：非目标。
- 第 10 章：第一版验收标准与落地范围。

---

## 1. 背景与目标

本系统目标是创建一个具备"AI 员工 / AI 同事"体验的自动工作流系统，而不是远程调用一个一次性 vibe coding 工具。

系统由客户端和服务器端组成：

- 客户端负责对话展示、任务查看、过程可视化和人工确认。
- 服务器端核心为 `bot-runtime`，按角色配置（master / worker / hybrid）切分调度面与执行面。
- `bot-runtime` 不是单纯的 worker 进程，而是带有工作区、上下文、任务、计划、技能和远程沟通能力的智能化机器人宿主。

用户通过连续对话提出需求，系统通过消息守卫识别意图，形成待确认的 task 与 plan。仅在用户确认后，task 才进入正式 TaskList 并由 bot-runtime 开始执行。任务确认后 AI 员工自主推进，仅在关键节点和结果确认时回到用户。

---

## 2. 参考项目边界

仓库外目录 `/Users/phoenix/code/` 下三个项目作为参考，不作为本需求直接改造对象：

- `claude-code-analysis/`：Claude Code 的 agent loop、tool 协议、subagent、multi-agent、skills、context、session、message guard、安全与持久化机制。
- `deer-flow/`：客户端产品形态、workspace、thread、agent、task、artifact、middleware pipeline、可视化与应用层组织方式。
- `xuedian/servers/bot-runtime`：文件系统持久化、飞书 channel、消息入口、绑定、异步出站 job、Guardian 与 `apps/chat` 的飞书配置客户端能力。

参考方式：吸收已经验证过的架构模式与原子能力；对涉及"AI 员工"独特语义（任务确认、计划变更、消息守卫、通用 channel 抽象）的部分自研。

---

## 3. 产品定位

系统呈现"AI 员工"的工作方式，核心体验包括：

- 有自己的工作区，而不是每次临时启动。
- 有持续上下文，能记住一个 thread 内的任务、计划、沟通记录与产物。
- 能理解模糊需求，并主动澄清、拆解、规划。
- 能维护任务列表、当前任务和每个任务的执行计划。
- 能在计划确认后开始执行，不擅自启动未确认工作。
- 任务确认后高度自主，仅在关键节点拦截人工。
- 能在执行中汇报进度、阻塞点、风险与下一步。
- 能处理任务或计划变更，并保留变更记录。
- 能接入远程沟通渠道（飞书优先），并把渠道作为可插拔能力，飞书只是第一种 ChannelProvider。
- 能被 prompt、skills 与基础能力配置影响，形成稳定的工作风格与能力边界。

---

## 4. 核心概念

### 4.1 User

`User` 是身份与权限的主体（v1 单层身份模型）。

- threads / tasks / plans 都有 `ownerUserId`。
- 飞书 / Slack 等外部通道的发件人通过 `User.channelIdentities` 映射到系统 User。
- v1 不引入 Org / Tenant / Workspace；不实现 RBAC；API 用 `Authorization: Bearer <user-token>`。

### 4.1.1 TaskList

`TaskList` 是 Thread 内"已确认任务清单"的权威集合，对应第 5.2、6.3 节里"task 进入 TaskList"的载体。本版将其作为一等对象：

- 一个 thread 恰好对应一个 TaskList（`Thread.taskListId` 严格 1..1，不可空）。
- TaskList 仅承载已确认任务（`status ∈ {confirmed, queued, running, awaiting_critical_node, blocked, changing, completed, failed, cancelled}`），草稿 task 不进入。
- TaskList 顺序由"用户确认时间"线性决定；v1 用户不可手动重排；调度器从队首向后扫描可执行任务。
- 完成 / 失败 / 取消任务保留在 TaskList 中作为历史，仅在客户端默认视图中折叠展示。

### 4.1.2 ChangeRecord

`ChangeRecord` 是任务 / 计划被用户在执行中修改时的完整审计记录，对应 `Task.changeRecordIds`。每次 `task_update` / `plan_update` 经守卫识别后必须产生一条 ChangeRecord：

- 关联 `taskId` / 旧 `planRevisionId` / 新 `planRevisionId` / 触发消息 id / 触发用户 id / 守卫决策 id。
- 携带变更摘要（用户原文 + LLM 生成的语义摘要）、归档动作（哪些 artifact 被移入 `_archive`）以及时间戳。
- 一旦写入即不可变（append-only），用于变更历史面板与审计。

### 4.1.3 ArtifactRecord

`ArtifactRecord` 描述一个任务产物文件的元数据，对应 `Task.artifactIds`：

- 字段：`id`、`taskId`、`planRevisionId`（产生该 artifact 的 revision）、`relativePath`（相对 `outputs/`）、`sizeBytes`、`mimeType`、`sha256`、`status ∈ {active, archived}`、`archivedAt`。
- 旧 revision 归档时不复制文件，仅将 `status` 标记 `archived` 并把记录指向 `_archive/<revisionId>/` 下的真实路径。
- 客户端 artifact panel 仅展示 `status=active` 的记录；变更历史面板可查询 `status=archived`。

### 4.1.5 TaskRetryState

`TaskRetryState` 将 `TaskBudget.maxRetries / attemptCount` 字段、§9.1 状态机、§17.3 in-flight 算法里关于"失败任务能否自动重试"的规则统一为一等记录，作为 `Task.retry` 字段挂在 task.json 上。它的目的不是引入新行为，而是让"哪些 failed 任务允许 master 自动 requeue"在 schema、状态机、事件、指标、测试五处保持一致：

- 字段：`attemptCount` / `maxRetries` / `failureClass` / `lastFailureAt` / `lastFailureReason` / `nextRetryAt` / `lastEventId`。
- `failureClass ∈ {transient_error, assertion_error, permission_error, user_cancelled}`：仅 `transient_error` 计入自动重试，其它三类一律落 `failed` 终态。
- `maxRetries` 默认 2，仅对 `transient_error` 计数；非 transient 失败不消耗 retry 配额、也不进入退避调度。
- `nextRetryAt` 退避策略：第 1 次失败 +30s，第 2 次 +120s，第 3 次起 +300s。
- 自动重试由 master 调度器执行，不由用户触发；用户取消信号优先级高于 retry 调度。
- 重试事件：每次自动 requeue 写 `task_retry_scheduled`；达到上限或落 `assertion_error/permission_error/user_cancelled` 写 `task_retry_exhausted`；任何被拒绝的状态转移写 `task_state_transition_blocked`。

### 4.2 Thread

`thread` 是对话、任务、计划、上下文与远程绑定的核心容器。

一个 thread 负责保护自己的上下文，避免不同群聊、不同任务、不同用户意图互相污染。

thread 维护：

- 对话消息（transcript）。
- TaskList（已确认任务清单）。
- active task（当前正在沟通或执行的任务，至多 1 个）。
- 草稿 task / 草稿 plan。
- thread 级上下文（背景、摘要、记忆）。
- 任务相关文件与产物索引。
- 多个远程沟通渠道绑定（跨 provider 也允许）。

群聊默认对应一个 thread。飞书 bot 私聊或其他入口也可以根据关联规则映射到 thread。

### 4.3 Task

`task` 是用户确认后的工作单元。

task 至少包含：

- `id`、`threadId`、`ownerUserId`、`confirmedByUserId`。
- 标题、描述、来源消息。
- 当前状态（见 6.6）。
- 当前 plan id 与 active plan revision id。
- 历史 plan revision 列表。
- 执行 runtime / executor id。
- 产物列表、变更记录。
- 错误和阻塞信息。
- 预算（最长执行时长、token 上限、subagent 上限、成本上限）。

### 4.4 Plan / PlanRevision

每个 task 都有自己的 plan。plan 描述：

- 任务目标、执行步骤、子任务、当前进度、依赖与阻塞、预期产物。

用户未确认前，plan 只能作为草稿。用户确认后绑定到正式 task 进入执行。

执行中变更时，旧 plan 不被静默覆盖，而是产生新的 `PlanRevision`（v1 全量重写），旧 revision 标记为 `superseded`，旧 artifact 归档可查（详见 6.5）。

### 4.5 Skill

`skill` 是可插拔能力包（不只是工具列表），可包含：

- 人设 / 角色风格、工作流程、领域能力、可用工具说明、执行约束、产物格式、质量标准。

bot-runtime 行为受 prompt 与 skills 共同影响。v1 默认全量加载本地 `skills/public/` 与 `skills/custom/`，仅过 schema 校验，不做 trust list / 沙箱执行。

#### 4.5.1 SkillManifest

`SKILL.md` 顶部 frontmatter 必须满足以下契约（schema 校验失败的 skill 不加载，写入 `skills_load_error` 事件）：

- `name`（必填，全局唯一，kebab-case）。
- `description`（必填，≤ 200 字符）。
- `when_to_use`（必填，自然语言触发条件描述）。
- `allowed_tools`（必填数组，可为空数组，仅可包含 v1 内置工具名或 MCP 工具名）。
- `agent` 或 `persona`（二选一必填）。
- `workflow`（可选，自然语言工作流提示）。
- `output_contract`（可选，约束产物的 schema 描述）。
- `version`（必填，semver）。
- `risk_class` ∈ `low | medium | high`（必填）。`risk_class=high` 的 skill 必须在 `CriticalNodePolicy` 默认配置中匹配 `kind: skill, action: require_approval`。

### 4.6 ChannelProvider（远程沟通）

远程沟通渠道是可插拔能力。`ChannelProvider` 是抽象接口，飞书、Slack、企业微信、邮件、自定义都是其实现。

每个 provider 至少需要：

- 配置管理（启用/禁用、凭据保存与脱敏读取）。
- 入站入口（webhook、长连接或轮询）。
- 入站校验（签名、challenge、时间窗口、来源合法性）。
- 消息归一化（转成统一 `InboundMessage`）。
- 幂等处理（按 provider event id / message id 防止重复）。
- 会话绑定（外部 chat / topic 与 thread 的关联规则）。
- 出站发送（异步 job，不阻塞 runtime loop）。
- 出站记录（记录平台 message id，防止"机器人回复触发循环"）。
- 可观测状态（配置、绑定、job、错误）。

v1 必须实现飞书 provider，覆盖：

- Bot 私聊与群聊。
- webhook URL verification。
- `x-lark-request-*` 签名校验。
- `im.message.receive_v1` 文本消息。
- 长连接作为可选入口。
- 创建群、删除群、发送文本消息。
- 已绑定群中仅在 `@bot` 或回复 bot 消息时路由到业务 thread。

### 4.7 MessageGuard（消息守卫）

消息守卫是进入 runtime 前的意图识别与安全边界。

职责：

- 来源识别、thread 关联、幂等。
- 意图分类：`chat / new_task / task_update / plan_update / confirm_task / confirm_plan / progress_query / cancel_task / irrelevant`。
- 是否需要生成或修改 task / plan。
- 是否是对当前 task / plan 的确认。
- 防止错误上下文进入 thread。

设计原则（详见 6.7）：

- 来源识别、thread 映射、幂等、确认状态由确定性代码处理。
- 语义意图可由 LLM 辅助，但必须输出结构化 `GuardDecision`。
- 未确认的 task / plan 不能进入正式 TaskList。

### 4.8 CriticalNodePolicy（关键节点）

`CriticalNodePolicy` 是配置化的拦截扩展点，用于在 AI 员工自主推进过程中只在关键时刻拦截人工：

- 匹配维度：`tool` / `external_io` / `filesystem` / `budget_overflow` / `out_of_scope`。
- 动作：`require_approval` / `block` / `log_only`。
- 作用域：`global` / `user` / `thread` / `skill`。
- v1 默认空清单，由用户跑起来后按需新增。

详见 6.4 自治原则与 6.8 关键节点机制。

---

## 5. 核心工作流

### 5.1 新消息进入

1. 用户在客户端、飞书 bot 私聊或群聊中发送消息。
2. ChannelIngress 接收并校验，做幂等。
3. 进入消息守卫两阶段判断（详见 6.7）：
 - 阶段 1：确定性规则短路（已绑群非 `@bot`/非回复 bot/非 slash/非 pending confirmation 直接 `ignore`）。
 - 阶段 2：LLM 结构化分类。
4. 命中已有 thread 或创建新 thread，消息追加到 thread 上下文。
5. 守卫结果写入 `guard-decisions.jsonl` 审计文件。

### 5.2 从对话生成任务

1. 用户提出需求。
2. 守卫判断该消息可能形成任务。
3. ThreadLoop 进入沟通和澄清阶段。
4. 系统生成候选 task 与候选 plan（草稿态）。
5. 草稿展示给用户。
6. 仅 owner user（task 发起者本人）可确认；群里其他人发"确认"被识别为 chat / irrelevant。
7. 用户确认后，task 进入 TaskList，状态 = `confirmed`。
8. master 调度时从 TaskList 按规则筛选可执行任务（不维护独立 TaskQueue）。

### 5.3 执行任务

1. master 派 `execute_task` job → worker。
2. worker 启动 Executor 加载 task / plan / context / workspace。
3. Executor 进入 agent loop：
 - 读取当前状态。
 - 推理下一步。
 - 评估 CriticalNodePolicy（命中即拦截 / 阻断 / 仅记录）。
 - 调用工具（含 subagent）。
 - 写入 events.jsonl。
 - 更新 plan step 状态。
4. ThreadLoop 监听 events.jsonl 与客户端流式同步。
5. task 完成后 Executor 写 task summary 回 thread，长 transcript 不倒灌。

### 5.4 执行中变更

1. 用户发出变更请求。
2. 守卫识别 `task_update` / `plan_update`。
3. ThreadLoop 写 `control.json signal=pause`。
4. Executor 完成当前 tool call → 写 `executor_paused`。
5. ThreadLoop 生成新 `PlanRevision`（full rewrite），旧 active artifact 移入 `outputs/_archive/<oldRevisionId>/`。
6. 走 task / plan 确认门禁（仅 owner user 确认）。
7. 用户确认后 ThreadLoop 写 `control.json signal=revise + revisionId`。
8. Executor 加载新 revision、重置 task ctx → 继续 loop。

### 5.5 关键节点拦截

1. Executor 在每次 tool dispatch 前评估 CriticalNodePolicy 列表（global → user → thread → skill）。
2. 命中且 `action=require_approval`：
 - 写 `critical_node_hit` 事件。
 - task.status → `awaiting_critical_node`。
 - 中止本次 tool call。
 - 等 `control.json signal=resume / cancel`。
3. 命中 `action=block`：写事件、跳过本次 tool call、继续 loop。
4. 命中 `action=log_only`：写事件、继续 tool call。

### 5.6 任务完成后

1. Executor 写 `executor_finished{outcome: completed}`。
2. ThreadLoop 向用户汇报 task 结果。
3. thread 进入沟通状态。
4. 系统询问或等待用户确认：
 - 是否接受结果。
 - 是否需要修订。
 - 是否进入下一个 task。
5. 已确认队列还有任务的，调度器自动取下一个；用户也可显式启动。

---

## 6. 产品规则

### 6.1 身份与权限模型

- v1 用 `User` 单层（不引入 Org / Tenant / Workspace）。
- 飞书 `operatorOpenId` → `User.id` 映射通过 `User.channelIdentities` 维护。
- threads / tasks / plans 都有 `ownerUserId`。
- API v1 用简单的 `Authorization: Bearer <user-token>`，token → user 由配置或单点登录服务解析。
- v1 不做 RBAC。

### 6.2 群聊确认权 — 仅发起者本人

- `Task.confirmedByUserId` 必须等于 `Task.ownerUserId`。
- 群聊中其他用户发的"确认"信号被消息守卫识别为 `chat` / `irrelevant`，不进入确认门禁。
- 防止上下文污染与抢夺。

### 6.3 active task 并发 — 严格 1 个

- `Thread.activeTaskId` 是 0..1，不是数组。
- 其余 confirmed 任务在 TaskList 里以 `queued` 视图等待（非独立 TaskQueue 数据）。
- master 调度从 thread 视角依次取下一个可执行任务。
- TaskList 顺序按"用户确认时间"线性单调；调度器只能从队首扫描；不允许"插队"调度。
- 任务终止状态（`completed` / `failed` / `cancelled`）仍保留在 TaskList 内作为历史；客户端默认折叠 30 天前的历史项。

### 6.4 自治原则 — 高自治 + 关键节点

任务确认后，AI 员工高度自治直至结果确认：

```
[任务草稿] → user 确认 → [自主执行] → 命中关键节点 → user 审批 → 继续 → [结果] → user 确认 → done
```

v1 默认能力授权：

- `bash` 工具：默认启用，限定执行目录在 `tasks/<task-id>/user-data/workspace/`，不限命令白名单。
- Skills：默认全量加载（local + public），不过 trust list；只过 schema 校验。
- MCP 服务器：默认可启用（启动时按配置加载），权限继承本地 bash。
- 网络访问：默认开放（HTTP/HTTPS），不过白名单。

v1 默认拦截清单：空（用户跑起来后通过 CriticalNodePolicy 配置新增，不需要改代码）。

### 6.5 变更后旧 plan / artifact — 归档可查

- `tasks/<task-id>/plan-revisions/<revision-id>.json` — 旧 plan revision 全量保存。
- `tasks/<task-id>/user-data/outputs/_archive/<revision-id>/` — 旧 artifact 移入此处。
- 客户端默认主视图只展示当前 active revision 的产物；"变更历史"面板可查阅旧 revision 与产物。
- Plan revision 形态：v1 默认 full rewrite（保留 patch 优化空间，v2 再说）。
- 变更链：线性（按时间编号），不允许从历史 revision 分支。
- 变更的变更：合法，链上多一个 revision。

### 6.6 多 channel 绑定

- 一个 thread 可同时绑定 N 个 binding（同 provider 多个、跨 provider 都允许）。
- `notify_bound_channel` 工具必须传 target：
 - `target: 'all'` — 通知所有 active binding（默认）。
 - `target: { provider: 'feishu' }` — 仅通知该 provider 的所有 binding。
 - `target: { bindingId: '...' }` — 精确指定。
- `chat-claims/<channel-type>/<external-chat-id>` 防止"同一外部 chat 被多 thread 占用"，反向不防（一个 thread 可多个外部 chat）。

### 6.7 消息守卫策略 — 规则短路 + 重点过 LLM

为控成本与防群聊噪声：

- **已绑群消息**：默认 `ignore`（写 transcript，不进上下文，不调 LLM）。仅在以下条件之一时进入第二阶段：
 - `@bot` 提及。
 - 回复 bot 出站消息。
 - slash 命令（`/confirm`、`/cancel`、`/status`）。
 - 当前 thread 处于 `waiting_confirmation` 状态且发送者是 task ownerUser。
- **未绑群消息**：完全 ignore（除非来自 Guardian 的"创建/绑定"流程命令）。
- **飞书私聊**：默认进入 LLM 守卫。
- **客户端**：默认进入 LLM 守卫。

LLM 守卫挂了的 fallback：

- 退化为只走规则；能识别为 `confirm_task` / `confirm_plan` / `cancel_task` 的就走，否则全部标 `chat` 入 transcript。
- 系统状态广播 `guard_degraded` 事件，客户端提示"AI 员工的意图识别暂时不可用，建议显式发送 `/confirm` `/cancel` 等命令"。

### 6.8 关键节点机制

通过 `CriticalNodePolicy` 配置化扩展，无需改代码：

```ts
type CriticalNodePolicy = {
 id: string
 scope: "global" | "user" | "thread" | "skill"
 matcher: NodeMatcher
 action: "require_approval" | "block" | "log_only"
 ownerUserId: string
 enabled: boolean
 createdAt: string
}

type NodeMatcher =
 | { kind: "tool", toolName: string, argMatch?: Record<string, unknown> }
 | { kind: "external_io", direction: "outbound", provider?: string }
 | { kind: "filesystem", op: "delete" | "overwrite", minCount?: number }
 | { kind: "budget_overflow", dim: "time" | "tokens" | "subagents" | "cost" }
 | { kind: "out_of_scope", planRevisionId: string }
```

加载顺序：global → user → thread → skill，后者覆盖前者。

示例：用户想让"对外发消息走审批"时，只需配置：

```json
{
 "id": "policy-001",
 "scope": "user",
 "matcher": { "kind": "external_io", "direction": "outbound" },
 "action": "require_approval",
 "ownerUserId": "user-1"
}
```

不需要改代码、不需要发版。

---

## 7. 客户端要求

客户端主要负责沟通与可视化，不承担核心智能执行。

第一版客户端应包含：

- **对话视图**：展示用户、runtime、远程渠道同步过来的消息。
- **thread 视图**：当前状态、上下文摘要、关联入口。
- **TaskList 视图**：当前 thread 的任务清单（已确认任务）。
- **active task 视图**：当前正在沟通或执行的任务。
- **plan 视图**：任务计划、步骤状态、变更记录与时间线。
- **变更历史面板**：历史 PlanRevision 与归档 artifact。
- **runtime 过程视图**：工具调用、subagent、日志、产物、阻塞点。
- **确认交互**：确认 task、确认 plan、确认变更、关键节点审批、取消、暂停。
- **Channel 配置抽屉**：启用/禁用、provider 配置、Secret 重新输入保存。
- **绑定状态视图**：未配置 / 未绑定 / 绑定中 / 已绑定 / 解绑中 / 失败。
- **Secret 安全展示**：客户端查询配置时只能看到 `hasSecret` 等布尔状态，不能回显 Secret 明文。
- **artifact panel**：仅展示 `outputs/` 目录下的产物，可预览、下载。

客户端体验重点是让用户看到 AI 员工的工作内容与进度。

---

## 8. 持久化要求

`bot-runtime` 基于宿主机磁盘工作。本地开发与线上部署都使用宿主机文件系统。

### 8.1 基本要求

- runtime 重启后数据不丢失。
- 服务重新部署后数据不丢失。
- 通过稳定 id 建立关联关系。
- 文件系统中的数据可检查、可恢复、可追踪。
- 临时文件与持久文件分区。

### 8.2 关键 ID

`runtimeId` / `userId` / `threadId` / `taskId` / `planId` / `planRevisionId` / `bindingId` / `channelType` / `externalConversationId` / `externalEventId` / `externalMessageId` / `jobId` / `executorId` / `policyId`。

### 8.3 实例级要求

- `runtimeId` 必须稳定，作为实例目录与重启恢复依据。
- 同一 `runtimeId` 同一时刻只能有一个进程持有锁（`flock` 或等价机制）。
- channel 配置、绑定、消息、webhook 去重、出站 job、关键节点策略都必须落盘。
- 重启时需要恢复 locked job、清理过期 dedupe、重建索引、修复孤儿 chat claim、复活 stale running task。

详细文件系统结构与恢复算法见 `design.md` 第 8 / 14 章。

### 8.4 上下文管理

上下文分层：

- **thread 级**：长期沟通、群聊语境、用户约定。
- **task 级**：当前任务目标、输入、计划、产物（独立于 thread context）。
- **plan 级**：步骤、进度、变更、执行结果。
- **runtime 工作上下文**：工具调用结果、临时文件、当前工作状态。
- **远程消息上下文**：原始消息、群聊、用户身份与来源。

要求：

- 不同 thread 隔离。
- 当前 active task 优先注入。
- 任务完成后沉淀摘要（不倒灌长 transcript）。
- 长对话压缩。
- 重要信息持久化。
- 临时上下文过期或清理。
- 变更记录可追踪。

---

## 9. 非目标

第一版不优先追求：

- 完整企业级权限系统（RBAC / Org / Tenant / Workspace）。
- 复杂组织架构管理。
- 任意工作流 DAG 编排器。
- 大规模多租户计费。
- 完整插件市场。
- 完整 AI 员工绩效系统。
- 多 active task 并行（严格 1）。
- Skill trust list / 沙箱执行（v1 不做）。
- bash 命令白名单 / docker 沙箱（v1 不做）。
- Slack、企业微信、邮件等多 provider 全量实现（v1 仅飞书）。
- retry 机制扩展项（任何一项都需开新 RFC，不在 v1 实现）：
 - 多机 standby master + fencingToken HA 部署。
 - 独立 RetryPolicy（per-skill / per-task override）。
 - SLA budget split（把 retry 时间从 task budget 拆出来）。
 - retry 跨 subagent 深度 ≥ 2 传播。
 - retry storm 自动节流 / circuit breaker。
 - per-tenant retry 配额、retry 任务数据库审计、retry 跨 thread 共享 quota。

第一版应优先验证：对话如何可靠形成任务、任务如何被确认、runtime 如何持续执行并让用户看见进度，以及关键节点拦截能否在最少配置下生效。

---

## 10. 第一版验收标准与落地范围

### 10.1 验收标准

第一版完成后，至少应能演示：

1. 用户在一个 thread 中连续对话。
2. 系统识别用户提出的是新任务还是普通沟通。
3. 系统生成草稿 task 和草稿 plan。
4. 仅 owner user 确认后，task 进入 TaskList，状态变为 `confirmed`。
5. runtime 开始执行 active task；同 thread 至多 1 个 running task。
6. 客户端能看到任务状态、计划步骤、执行日志、产物与流式事件。
7. 用户在执行中提出变更，系统能记录变更、归档旧 artifact、生成新 PlanRevision、走确认门禁后继续执行；该变更必须留下一条 `ChangeRecord` 关联旧 / 新 PlanRevision 与触发消息。
8. task 完成后，系统回到沟通状态并等待下一个任务。
9. runtime 重启后，thread / task / plan / transcript / artifact 不丢失。
10. 同一 webhook event id 重复投递时，inbound 幂等保证只产生一次 GuardDecision。
11. bot-runtime 进程被强杀（kill -9）后重启，已确认任务在不超过 60 秒内自动恢复执行（in-flight tool call 按幂等策略处理）；in-flight 写工具的"目标文件未变化"判定走 sha256 哈希对比。
12. CriticalNodePolicy 配置生效不需要重启服务；新增一条 `kind: external_io, action: require_approval` policy 后，下一次外发动作自动走审批。
13. SKILL.md frontmatter 缺少必填字段时，runtime 启动加载阶段必须拒绝该 skill 并写入 `skills_load_error` 事件，其它 skill 正常加载。
14. 任务被取消（`/cancel` 或客户端按钮）时，同一任务状态机只能从 `confirmed / queued / running / awaiting_critical_node / blocked / changing` 进入 `cancelled`；不允许从 `completed / failed` 反转为 `cancelled`。
15. TaskList 的顺序在 runtime 重启前后保持稳定（按用户确认时间线性，且不允许重排）。
16. schema 校验单元测试必须覆盖 TaskList / ChangeRecord / ArtifactRecord / SkillManifest 全部必填字段缺失、类型错误、枚举越界的负样本，且每条 schema 至少 1 条正样本通过。
17. 状态机转移测试必须覆盖 §9.1 中所有边，且 `failed → queued` 自动重试仅在 `attemptCount < maxRetries` 且失败属于 `transient_error` 时触发；`completed` / `cancelled` 任务的任何向外转移尝试必须被拒绝并写 `task_state_transition_blocked` 事件。
18. TaskList 与 `tasks/` 子目录的一致性校验在重启时必须执行；不一致时写 `task_list_repair` 事件，且 `task_list_repair_total` 指标可见。
19. ArtifactRecord 元数据与磁盘文件实体不一致（缺失 / 多余 / sha256 不匹配）时，重启扫描必须标记为 `artifact_consistency_warning` 事件，并暴露 `artifact_consistency_warning_total` 指标。
20. MessageGuard / TaskConfirmation / PlanRevision 三条 agent eval 必须各自给出固定数据集大小、通过阈值、失败时回归处理策略，并在 `tests/evals/results/` 留下日志。
21. `TaskRetryState.failureClass=transient_error` 且 `attemptCount < maxRetries` 且 `now >= nextRetryAt` 的 failed 任务，必须由 master 调度器自动转入 `queued`，并写一条 `task_retry_scheduled` 事件（含 `attemptCount`、`nextRetryAt`、`failureClass`、`taskId`）。不满足上述条件的 failed 任务必须停留在 `failed`，并写 `task_retry_exhausted` 或 `task_state_transition_blocked`，不得静默丢弃。
22. `failureClass ∈ {assertion_error, permission_error, user_cancelled}` 的 failed 任务，自动重试路径必须断开：master 不得把它们重新放回 `queued`；客户端可以走"用户显式重试"通路，但该通路必须把 `attemptCount` 重置为 0、`failureClass` 清空、`nextRetryAt` 清空，并写 `task_manual_retry_requested` 事件。
23. `TaskRetryState` 与 §9.1 状态机必须保持一致：所有从 `failed` 走出的转移仅允许 `failed → queued`（自动重试或用户显式重试）；从 `failed` 出发到 `running / completed / cancelled / changing` 的尝试都必须写 `task_state_transition_blocked`。
24. `task_retry_scheduled_total`（labeled by `failureClass`）、`task_retry_exhausted_total`（labeled by `failureClass`、`reason=max_retries|non_transient`）、`task_manual_retry_total` 必须在 §19 指标列表中暴露，可在监控面板按 failureClass 聚合。
25. master 重试调度器必须按固定轮询周期（默认 5s，由 `RUNTIME_RETRY_POLL_MS` 配置）扫描所有 `status=failed` 任务；候选任务按 `task.retry.nextRetryAt` 升序处理，避免老任务饿死。每条候选都先写 `task_retry_scheduled` 再翻状态到 `queued`，写不成功（如磁盘满）必须保留在 `failed` 不静默丢弃。
26. master 重试调度器与 `failed → queued` 状态翻转必须在同一进程串行执行；多 master 实例共存（v2 多机）时通过 `data/instances/<runtime-id>/state/_locks/retry-scheduler.lock` 的单写者锁保证 v1 hybrid 与 v2 多机都不会出现"双 master 同时把同一任务标 queued 两次"。
27. runtime 重启扫描时不得绕开 retry 合同：扫描到 `status=failed` 的任务必须保留 `failed` 状态，不预先回填 `queued`；只有重试调度器在下一个轮询周期内根据 `nextRetryAt` 决定是否 requeue。
28. master 进程收到 SIGTERM / SIGINT 时必须 graceful 关停重试调度器 fiber：先停止下一轮扫描，等当前轮中已写 `task_retry_scheduled` 的任务把 `task.status` 翻成 `queued` 后再释放 `state/_locks/retry-scheduler.lock`，最后写 `runtime_shutdown{role: master}` 事件并退出。强杀超时（默认 30s）时必须把 lock 文件标记 stale，让下一任 master 启动时清理。
29. 误标 failureClass 的诊断路径必须存在：当一个任务连续两次 transient_error 重试都失败、且失败原因（`lastFailureReason`）字符串相似度 < 0.5 时，写一条 `task_retry_classification_warning{taskId, attemptCount, similarity, hint: "consider_assertion_error"}` 事件，并把 `task_retry_classification_warning_total` 暴露为 metric。
30. `state/_locks/retry-scheduler.lock` 必须携带 `lockHolderRuntimeId / acquiredAt / leaseExpireAt / fencingToken`；新 master 启动检测 `now > leaseExpireAt` 时按 stale 处理，并且写 `retry_scheduler_lock_stolen{previousHolder, currentHolder, fencingToken}` 事件，避免双 master 静默切换。
31. `Task.blockedReason` 必须显式取 `retry_pending / retry_exhausted / awaiting_user_action / non_idempotent_tool_in_flight` 四值之一；任何把 `task.status` 写为 `blocked / failed` 的转移路径必须同时设定 `blockedReason`，缺失时视为 schema validation 失败并写 `task_state_transition_blocked{reason: "missing_blocked_reason"}`，不得让客户端面板显示"未知阻塞原因"。
32. SSE custom 事件 `task_blocked{taskId, blockedReason, suggestedActions: ["retry"|"skip"|"cancel"][]}` 必须在 `Task.blockedReason` 变化的同一事务里写入 events.jsonl 与 SSE 流；客户端收到该事件后必须能在动作面板上启用恰当按钮（`retry_exhausted` → 仅 `cancel`；`retry_pending` → `cancel`；`awaiting_user_action` → 三选一；`non_idempotent_tool_in_flight` → 三选一）。
33. `task_blocked_total{blockedReason}` 与 `task_block_resolution_total{blockedReason, action=retry|skip|cancel}` 两条 counter 必须暴露在 §19；监控面板按 blockedReason 聚合阻塞分布，按 action 验证用户决策路径是否被使用。
34. runtime 启动重启扫描必须在 step 7 中显式处理 stale `state/_locks/retry-scheduler.lock`：当该文件 `lockHolderRuntimeId != currentRuntimeId` 且 `now > leaseExpireAt` 时，必须 rename 为 `retry-scheduler.lock.stale.<oldFencingToken>`（保留至少 7 天）、写 `runtime.jsonl` 事件 `retry_scheduler_lock_reclaimed{previousHolder, previousFencingToken, leaseExpireAt, currentRuntimeId, cause}`、写 `retry_scheduler_lock_stolen` 事件、并把 `retry_scheduler_lock_reclaimed_total{cause}` 与 `retry_scheduler_lock_stale_files` 两条 metric 暴露到 §19；不得直接 unlink 原文件以免丢失审计依据。
35. 运行时遇到缺少 `TaskRetryState` 的历史 task 时，必须执行一次性迁移脚本 `migrate_task_retry_state()`：扫描 `tasks/<task-id>/task.json`，对每个 `retry` 字段缺失的 task 按映射表（`task.budget.maxRetries → task.retry.maxRetries`，默认 2；`task.budget.attemptCount → task.retry.attemptCount`，默认 0；其余字段空）写入 `task.retry`，并写一条 `task_schema_migrated{taskId, fromVersion, toVersion, migratedFields}` 事件；任何写入失败必须留 task 在原状态、不写 `task_schema_migrated`、并把该 task 标记 `migration_pending`。
36. `tasks/<task-id>/task.json` 必须包含 `schemaVersion: 2`（含 retry 的版本）字段；schemaVersion=1 的 task 在 master 调度器扫描时必须跳过（不写 retry 事件、不变更状态），由迁移脚本下一轮处理；schemaVersion 缺失或解析失败时按 1 处理，避免 master 把未迁移 task 错误重试。
37. 端到端测试套件必须包含一条名为 "kill-9 retry recovery" 的剧本：从 transient_error 失败开始，模拟 master 在写完 `task_retry_scheduled` 但未翻 task.status 时被 kill -9；新 master 启动后必须在 90s 内（90000 ms）让该 task 走完 replay 修复 → queued → 重新 leased → 重做 → completed 全流程；剧本断言 `retry_scheduler_replay_corrected_total += 1`、`task_retry_scheduled` 事件不出现两次（幂等去重）、`runtime_shutdown` 不被假写（kill -9 不发 SIGTERM）、最终 task.status=completed。任意断言失败即判 retry 端到端回归阻塞发布。
38. `Task.lastUserSignalAt`（ISO timestamp）字段：每次 `cancel` / `pause` / `revise` 信号写入 `control.json` 时同步刷新。master 重试调度器在 `failed → queued` 转移前必须比较 `task.retry.lastFailureAt` 与 `task.lastUserSignalAt`：若 `lastUserSignalAt > lastFailureAt` 且最近的用户信号是 cancel，则不调度 requeue、写 `task_retry_skipped{reason: "user_cancel_supersedes"}`，并保持 `failed` 终态（不再走 retry）。该规则必须能在 fake clock 下用 unit test 覆盖。
39. Scope 边界 — v1 显式不做的 retry 扩展必须在 §9 / §23.1 列出，**作为强约束**：(a) 多机 standby master + fencingToken HA 部署；(b) 独立 RetryPolicy（per-skill / per-task override）；(c) SLA budget split（把 retry 时间从 task budget 拆出来）；(d) retry × subagent 深度 ≥ 2 传播；(e) retry storm 自动节流。任何以上扩展都必须开新 RFC，不得直接合并到 v1 范围。
40. `plan_update` 在 task 处于 `failed`（等待自动重试或已 retry_exhausted）时必须触发"retry 配额重置"路径：master 在写入新的 `PlanRevision` 与 `ChangeRecord` 的同一原子事务里把 `task.retry.attemptCount` 重置为 0、`failureClass` 清空、`nextRetryAt` 清空、`lastFailureAt` 清空、`lastFailureReason` 清空、`lastEventId` 推进；写一条 `task_retry_reset_by_plan_update{taskId, oldAttemptCount, oldFailureClass, changeRecordId, planRevisionId, at}` 事件；`task_retry_reset_by_plan_update_total{oldFailureClass}` counter 暴露在 §19。事务任何一步失败时必须回滚 PlanRevision 写入、保留旧 retry 状态、写 `task_state_transition_blocked{reason: "plan_update_retry_reset_failed"}`，避免出现"plan 切换但 retry 仍按旧 attemptCount 调度"的窗口。`failed → queued` 由 `plan_update` 触发的转移路径必须使用新的 PlanRevision 重新派发 job，禁止复用旧 fencingToken。
41. SSE 客户端必须每 `RUNTIME_SSE_ACK_INTERVAL_MS` 毫秒（默认 10000）回写一次 `client_ack{cursor: <lastEventId>, ackedAt}`；server 端 SSE handler 在 `RUNTIME_SSE_ACK_TIMEOUT_MS`（默认 30000）内未收到 ack 时必须写一条 `sse_ack_missing{threadId, taskId?, lastSentEventId, lastAckedEventId, gapEvents, at}` 事件并把 SSE 连接标记为 `degraded`，下一轮事件 push 前先发 `sse_replay_emitted{fromEventId, toEventId, eventCount, reason: "ack_missing"}` 让客户端补齐；replay 窗口由 server 维护内存环形缓冲，至多 `RUNTIME_SSE_REPLAY_BUFFER_EVENTS`（默认 1000）条事件 / `RUNTIME_SSE_REPLAY_MAX_AGE_S`（默认 600）秒；溢出时写 `sse_replay_truncated{threadId, droppedEventCount, oldestRetainedEventId, reason: "buffer_overflow"|"max_age_reached"}` 并通知客户端走"重新加载完整 thread events.jsonl"路径，不允许静默丢事件。三条 counter `sse_ack_missing_total{threadId}` / `sse_replay_emitted_total{reason}` / `sse_replay_truncated_total{reason}` 必须暴露在 §19；监控面板按 reason 验证客户端补齐与 buffer 容量。客户端三动作面板（task_blocked + suggestedActions）必须在 ack 重连后保持按钮可点击，断网恢复后不清空已显示的 blocked task 列表。
42. `POST /api/tasks/{id}/retry`、`POST /api/tasks/{id}/skip`、`POST /api/tasks/{id}/cancel` 三个客户端三动作端点必须在 server 端做两阶段校验：(1) `task.ownerUserId == authedUserId`，否则写 `task_action_denied{taskId, requestedAction: "retry"|"skip"|"cancel", reason: "not_owner", requestedByUserId, at}` 事件、返回 HTTP 403、`task_action_denied_total{action, reason="not_owner"} += 1`；(2) `task.status` 必须允许该动作（completed / cancelled 是终态，对任何 action 都拒绝；retry 仅允许 `failed` + `blockedReason ∈ {retry_pending, retry_exhausted, awaiting_user_action, non_idempotent_tool_in_flight}`；skip 仅允许 `blocked / failed`；cancel 允许任何非终态），否则写 `task_action_denied{reason: "invalid_state"|"terminal_state"}`、返回 HTTP 409、`task_action_denied_total{action, reason="invalid_state"|"terminal_state"} += 1`。两阶段校验顺序固定为 owner → status，避免对越权用户暴露 task 状态信息。每条 deny 事件必须先于任何状态翻转写入；客户端收到 4xx 时必须在 UI 显示明确的"权限拒绝"或"无效状态"提示。
43. `notify_bound_channel` 工具调用必须经过 (taskId, providerId, target) 三元组级别的去重节流：默认 15 分钟滑动窗口内同一三元组、同一 `notificationKind`（task_failed / task_retry_started / task_retry_exhausted / task_blocked）至多发送 1 次；窗口内重复触发时 master 不调用 ChannelProvider，转而写一条 `notify_throttled{taskId, providerId, target, reason: "duplicate_retry_window", suppressedNotificationKind, windowStartedAt, at}` 事件，counter `notify_throttled_total{provider, reason="duplicate_retry_window"} += 1`。除三元组窗口外，全局 (instance, provider, target) 维度按 `RUNTIME_NOTIFY_GLOBAL_RPM=30` 限频；超频时同样写 `notify_throttled{reason: "global_rate_limit"}`、`notify_throttled_total{provider, reason="global_rate_limit"} += 1`。窗口与全局限频均不持久化（v1 内存即可），重启后重置；用户显式重试（`task_manual_retry_requested`）会重置 (taskId, providerId, target) 窗口。
44. `tasks/<task-id>/events.jsonl` 必须在 `RUNTIME_EVENTS_JSONL_MAX_BYTES=67108864`（64MB）或 `RUNTIME_EVENTS_JSONL_MAX_AGE_DAYS=30` 任一阈值满足时执行原子归档：(1) 写入新事件前，runtime 检测 active size / age；(2) 触发时先 fsync 当前 events.jsonl，再 atomic rename 为 `events-archive/<task-id>/<archive-id>.jsonl.gz`（gzip 压缩，archive-id 由 `<startTimestamp>-<endTimestamp>-<sha256-prefix-8>` 组成），(3) 创建新 empty events.jsonl 并立即 append 一条 `events_jsonl_rotated{taskId, archivedFile, archivedSize, archivedAgeDays, reason: "size_overflow"|"age_overflow", at}` 事件标识断点；(4) 失败时保留旧文件继续 append，写 `events_jsonl_rotation_failed{taskId, errorClass: "io_error"|"compress_error"|"rename_error", at}` + `events_jsonl_rotated_total` 不增。归档文件由 §17 重启扫描包含进 task 历史回放（按 archive-id 时间范围回放），SSE replay buffer 不回放归档文件。`events_jsonl_active_size_bytes{taskId}` gauge 暴露当前 active 文件大小供监控；活跃文件 > 50% 阈值时升预警。
45. `task.retry.lastFailureReason` 字段在持久化前必须经过 PII 脱敏管线（与 §18.4 transcript 脱敏共用规则）：覆盖 email / phone / api_key / bearer_token / credit_card / id_number 6 类正则；命中时写一条 `lastFailureReason_redacted{taskId, redactedKinds, originalLengthBytes, redactedLengthBytes, at}` 事件；counter `task_failure_reason_redacted_total{redactedKind}` 暴露在 §19。脱敏后字段写入 `task.json` 与 events.jsonl；LLM 内存上下文（用于决定 retry / classification）保留原始内容（避免脱敏导致模型分类质量下降）。脱敏失败（regex 异常 / 长度超 16KB）时必须截断到 16KB 并写 `lastFailureReason_redaction_failed{taskId, errorClass: "regex_exception"|"length_overflow", at}`，不允许把原始未脱敏内容写盘。脱敏函数必须可单元测试，且与 §18.4 共享同一份正则定义文件，避免双份维护漂移。
46. retry 不向 subagent 级联 — `subagent_spawned` 衍生的子任务出现 transient_error 时由 subagent 自身的执行循环决定是否报错回父 task；父 task 的 retry 调度器不感知 subagent 内部失败、不为 subagent 重新分配 retry 配额、不写 `task_retry_scheduled`。父 task 收到 `subagent_completed{summaryRef.outcome="failed"}` 时按本地 transient_error / assertion_error 分类决定父 task 自己的 retry 路径，与 subagent 内部 retry 机制互不影响。该约束与 §23.1 第 (d) 项 "retry × subagent 深度 ≥ 2 传播" v1 不做项一致。
47. budget_overflow 与 retry 互斥 — `task.budget` 任意一项（maxDurationMs / maxTokens / maxSubagents / maxCost）耗尽时 master 必须把 task.status 翻 `failed` 并设 `failureClass="budget_overflow"`、`blockedReason="retry_exhausted"`、不写 `task_retry_scheduled`、不进入退避调度；budget_overflow 不消耗 retry 配额。客户端三动作面板对 budget_overflow 失败仅启用 `cancel`（与 retry_exhausted 一致）。
48. TaskList ordering 在 retry 路径下保持稳定 — `failed → queued` 自动 retry 不修改 task 在 TaskList 中的位置（按 `confirmedAt` 线性顺序），调度器仍从队首向后扫描；retry 调度本身不上调任务优先级。`task_manual_retry_requested` 也不重排。任何企图通过 retry 路径修改顺序的逻辑必须被拒绝，写 `task_state_transition_blocked{reason: "retry_must_not_reorder_tasklist"}`。
49. retry 重做 tool call 时必须重新评估 CriticalNodePolicy — master 在 `failed → queued` 转移并派发新 ExecuteTaskJob 后，新 executor 在每次 tool call 之前必须重新走 `Pol.evaluate(toolCall)`；不允许沿用上次失败时的 policy 决策（policy 配置可能已 hot-reload）。`policy.matchedKind=skill` 且 `risk_class=high` 的 skill 在 retry 路径上仍然必须走 `awaiting_critical_node` 拦截，不允许"上次已 approve 过就跳过"的 caching。
50. 运维可观测必备：(a) FailureClassClassification eval 必须存在固定数据集 200 条（4 类 × 50：transient_error / assertion_error / permission_error / user_cancelled），LLM 自动分类与人工标注一致率 ≥ 90%、micro-F1 ≥ 0.85；低于阈值阻塞发布，并把样本回归到 prompt / few-shot；落 `tests/evals/results/<date>/failure-class.json`；(b) Grafana retry 仪表盘核心 5 行面板 + 3 条告警必须随 v1 一起部署：行 1 `task_retry_scheduled_total{failureClass}`（每分钟）、行 2 `task_retry_exhausted_total{failureClass, reason}` / `task_retry_classification_warning_total`、行 3 `retry_scheduler_lock_stolen_total / retry_scheduler_lock_reclaimed_total{cause}` / `retry_scheduler_lock_stale_files`、行 4 `task_schema_migration_total / task_schema_migration_failed_total{errorClass}`、行 5 `task_blocked_total{blockedReason}` / `task_block_resolution_total{action}`；告警 1：`task_retry_scheduled_total{failureClass="transient_error"}` 5 分钟均值 > 10/min（retry 风暴）；告警 2：`retry_scheduler_lock_stale_files` > 5（多次 stale 未清理）；告警 3：`task_schema_migration_failed_total > 0` 即 page。所有面板与告警的 Grafana JSON 必须版本化在 `ops/grafana/retry-dashboard.json`，与 §19 metric 列表一一映射。
51. retry 故障排查 runbook 必须随 v1 一起发布：`docs/runbooks/retry-troubleshooting.md` 至少包含 5 个独立 SOP，每个 SOP 包含 (signal, 后续假设, diagnose 命令 / metric 查询, mitigate 步骤, escalation 联系人)：(1) retry 风暴 — `task_retry_scheduled_total{failureClass="transient_error"}` > 10/min；(2) lock stale 累积 — `retry_scheduler_lock_stale_files > 5`；(3) schema migration 失败 — `task_schema_migration_failed_total > 0`；(4) classification 误判风暴 — `task_retry_classification_warning_total` 短时上升；(5) kill-9 retry recovery 路径阻塞 — `retry_scheduler_replay_corrected_total` 异常 + `retry_scheduler_lag_ms > 30000`。runbook 必须能让 oncall 在 15 分钟内复现并缓解任意 SOP；CI 阶段加入"runbook 可执行性测试"（mock 故障 + 对比预期 metric 走向）。
52. `GET /api/tasks/{id}/retry-history` 必须返回该 task 的完整 retry 链路：JSON 数组按事件时序排列，元素覆盖 `task_retry_scheduled / task_retry_exhausted / task_manual_retry_requested / task_retry_skipped / task_retry_classification_warning / task_retry_reset_by_plan_update / events_jsonl_rotated` 全 7 类事件；每个元素携带 `attemptCount`、`failureClass`、`failureReason`（已脱敏）、`nextRetryAt`、`triggeredBy: "master"|"user"|"plan_update"`、`at`。owner 校验复用验收 42 路径（非 owner 返回 HTTP 403 + `task_action_denied{requestedAction: "retry-history-view", reason: "not_owner"}`）。响应大小 > 1MB 时分页（cursor-based, default 100 events / page）。
53. channel inbound 重投递幂等：每个 ChannelProvider 必须以 `(providerId, eventId)` 为键持久化"已处理 webhook 事件"集合（落 `state/channel-events/<providerId>/<eventId>.json`），24h TTL；同一键重投递时直接返回 200 不再触发 Guard / 不写 GuardDecision、不创建 task draft；命中时写 `inbound_duplicate{providerId, eventId, originalProcessedAt, at}` 事件 + `inbound_duplicate_total{providerId} += 1` counter。providerId 仅用于隔离（飞书 + Slack 独立空间），不允许跨 provider 共享键。
54. SSE replay correctness：server 在 §16.2 ring buffer 与 §16.4 retry-history 合并 events 时必须保证单调递增 eventId（events.jsonl + active 不冲突），且因果顺序保留 — 派生事件（`task_block_resolved`）始终在源事件（`task_blocked`）之后；写一条 `sse_replay_invariant_violated{taskId, expectedAfterEventId, actualEventId, at}` 即视为 P0 故障并 page，counter `sse_replay_invariant_violated_total{taskId} += 1`。CI 必须有 chaos test 注入 events.jsonl 乱序后断言 server 拒绝 replay 并写违规事件。
55. artifact 一致性漂移检测：runtime 启动时按 §17.2 step（接续重启扫描）对每个 task 的 ArtifactRecord 计算磁盘 sha256 与记录值对比；不一致时写 `artifact_consistency_warning{taskId, artifactId, kind: "missing"|"extra"|"sha256_mismatch", recordedSha256, actualSha256?, at}` 事件 + `artifact_consistency_warning_total{kind} += 1`；客户端 artifact panel 必须显式标记漂移项（红框 + 提示），不允许默认渲染（避免用户误信任已损坏的产物）。漂移项不阻塞 task 后续操作；用户可手动 `POST /api/artifacts/{id}/reseal` 重新计算 sha256（仅 owner 可调，复用验收 42）。
56. skill load 风暴隔离：runtime 启动加载 `skills/public/` + `skills/custom/` 时必须按 skill 文件粒度独立处理 schema 校验失败：单个 skill 失败写 `skills_load_error{skillName, errorClass: "schema_invalid"|"yaml_parse"|"name_conflict", at}` 事件 + `skills_load_error_total{errorClass} += 1`，但不影响其它 skill 加载；连续 N（默认 5）次同一 skill 失败时降级到上次有效缓存（持久化在 `state/_diagnostics/skills-cache.json`），写 `skills_fallback_to_cache{skillName, cacheTimestamp, at}` 事件 + `skills_fallback_to_cache_total{skillName} += 1`。skill 缓存仅作为启动 fallback，正常路径仍优先读 disk skill；管理面通过 `GET /api/skills/load-status` 查看每个 skill 当前来源（disk / cache / failed）。

### 10.2 落地范围

第一版必做：

- 文件系统状态库与 ID 规范（含 `.lock`、`.runtime-info.json`、fencing token）。
- User / Thread / TaskList / Task / Plan / PlanRevision / ChangeRecord / ArtifactRecord / SkillManifest / GuardDecision / ChannelConfig / ChannelBinding / CriticalNodePolicy 数据模型。
- bot-runtime 单机 hybrid 角色（master + worker 同进程）。
- 进程内分层：ThreadLoop（per thread）+ Executor（per task）。
- task / plan 草稿与确认门禁（仅 owner user）。
- TaskList 唯一权威，调度从 List 投影队列视图。
- append-only transcript / events.jsonl / guard-decisions.jsonl。
- 基础工具协议（read_file / write_file / list_dir / str_replace / bash / present_files / ask_clarification / confirm_task / confirm_plan / update_task / update_plan / task / notify_bound_channel）。
- 客户端对话 + TaskList + active task + plan + 变更历史 + artifact + Channel 配置。
- 通用 channel 配置、多绑定、入站幂等、出站 job、脱敏配置 API。
- 飞书 provider 的 webhook、长连接、文本消息、群聊路由、Guardian、Operator OpenId 映射。
- 消息守卫两阶段判断（规则短路 + LLM）+ guard fallback。
- CriticalNodePolicy 加载、评估与 `awaiting_critical_node` 状态机。
- SSE 流式协议 + cursor 续传。
- 故障恢复：lock + fencing token + 重启扫描 jobs/locked。
- Secret / PII 脱敏（写 transcript 前 sanitize）。
- 三条关键路径 agent eval：MessageGuard / TaskConfirmation / PlanRevision。

第一版暂缓：

- 多机部署（master / worker 物理分离 + 共享存储 / RPC）。
- 完整 MCP 管理 / Skill 市场 / Skill trust list。
- Plan revision 支持 patch（小变更不全量重写）。
- 关键节点策略图形化配置面板。
- 多 active task。
- 数据保留与清理策略（GDPR / 磁盘满）。
- prompt 版本化、模型路由 / fallback / 速率限制。
- 国际化（zh / en）。
- Slack、企业微信、邮件等多 provider。
- 企业级权限。

### 10.3 推荐实施顺序

1. 文件系统状态库底座：实例目录、`.lock`、`.runtime-info.json`、ID 规范。
2. User / Thread / Task / Plan / PlanRevision schema 与状态机。
3. ThreadLoop ↔ Executor 通信协议（jobs / events.jsonl / control.json）。
4. Runtime loop：模型调用、工具协议、tool_result 回流、事件流。
5. 客户端可视化：对话、TaskList、active task、plan、artifact、runtime events。
6. 通用 channel 子系统：配置、多绑定、入站幂等、出站 job、脱敏配置 API。
7. 消息守卫：规则短路 + LLM 结构化 + fallback。
8. 飞书 provider：webhook / 长连接、签名校验、群聊路由、Guardian、Operator OpenId 映射。
9. CriticalNodePolicy 机制：加载、评估、`awaiting_critical_node` 状态机。
10. 故障恢复扫描与 fencing token。
11. 三条关键路径 agent eval。

技术细节、数据模型、文件系统结构、通信协议、状态机、工程默认值见 `design.md`。
