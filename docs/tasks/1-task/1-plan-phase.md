# Task 1 · MCP · Plan Phase

> 本文件遵循 `docs/principles.md` 的 phase 文件结构。完成本 phase 的标志：用户对本文件签字确认，方可进入 build phase。

---

## 一、目标

把 `docs/requirements/1.requirements.md` 与 `docs/design/architecture.md` 中已敲定的 16 项决议拆解为可执行任务，**输出一份覆盖第一阶段全量功能的实施规划**，让任意接手者只需读本文件 + requirements + architecture 即可独立开工。

具体产物：
- 8 个里程碑（M0、M1、M2、M3、M4、M5a、M5b、M6）的任务清单，每条任务带验收标准与依赖关系。
- 每个里程碑的 Review 出口标准。
- 全部未决项与已记录的决策。

---

## 二、前置依赖

| 依赖 | 状态 |
|---|---|
| `docs/requirements/1.requirements.md`（含 §14 关键决议、§15 客户端规划） | ✅ 已就绪 |
| `docs/design/architecture.md`（已纳入决议增量；§10 已映射） | ✅ 已就绪 |
| `docs/principles.md`（开发准则） | ✅ 已就绪 |
| 用户对本 plan-phase 的评审确认 | ⏳ 待办 |

---

## 三、技术栈速查

| 域 | 选型 |
|---|---|
| 后端 | Python 3.12 · FastAPI · APScheduler · Celery · SQLAlchemy 2.x · Alembic · pydantic v2 |
| 存储 | PostgreSQL 16 · JSONB · 本地文件系统 · Redis（Celery broker / 短 TTL 缓存） |
| LLM | 多云 + 自建 `LLMGateway`（统一 messages / function-call / cache / batch / 调用追踪） |
| 数据源 | akshare（主）· Tushare（补）· yfinance · FRED · 自有 RSS/PDF |
| 前端 | Next.js 16（App Router · RSC）· React 19 · Tailwind v4 · shadcn/ui · ECharts · Cytoscape.js · TanStack Query · Zustand |
| 工程化 | uv（Python 包管理）· pnpm（Node）· ruff · mypy · pytest · ESLint flat · Prettier · Vitest · Playwright |
| 部署 | 单机 Docker Compose（pg + redis + backend + worker + web + caddy） |

---

## 四、里程碑划分

| 里程碑 | 主题 | 关键产出 | 估时 |
|---|---|---|---|
| **M0** | 工程基线 | 仓库结构、CI、本地起跑、基础 schema、ADR 索引 + metrics 命名 ADR | 1 周 |
| **M1** | 数据层与领域模型 | 数据源 Spike → Collector + 实体表 + Evidence + Sector 三表 + 指标 + 运行时/会话基础表 + 最小手工边录入 | 2.5 周 |
| **M2** | 核心 Skill | API payload schema + 板块中心、龙头识别、长期价值、大盘/热点、产业链分析器 | 2 周 |
| **M3** | LLMGateway + 文本抽取 | Gateway 多云路由、公告抽取、轻量 NL 问答 | 1.5 周 |
| **M4** | 调度与提醒 | `alert_record` schema + Scheduler、策略 DSL 引擎、提醒三重闸 + 日报兜底、飞书/电报 | 1.5 周 |
| **M5a** | Web 客户端 · 看板线 | 主页、分析页(大盘/板块/个股/事件)、提醒中心、产业链/影响图 | 1.5 周 |
| **M5b** | Web 客户端 · 对话线 | Chat 多 thread + Artifact 内联 + 流式 + 策略页 NL→DSL | 1.5 周 |
| **M6** | 集成与上线 | 跨市场映射手工边正式工作流、E2E、可观测性、单机部署 | 1 周 |

总估时约 12.5 周（单人节奏，含 ~20% 缓冲）。M1 估时上调反映"数据源 Spike 前置 + 最小手工边录入"两项;M5 拆 a/b 反映前端实际工作量。

---

## 五、任务清单（含验收标准）

> 约定：每条任务用 `- [ ]` 起头便于勾选。每条任务在第二行注明**验收标准**（一行内可衡量）。任务 ID 形如 `M0-T1`，便于在后续 phase 文件回引。

### M0 · 工程基线

#### 后端
- [ ] **M0-T1** 创建后端 monorepo 骨架 `backend/`，子包 `app/{api,domain,data,runtime,orchestration,skills,llm}`
  - 验收：`uv run python -c "import app"` 通过；`tree -L 3 backend` 与本规划一致。
- [ ] **M0-T2** 接入 FastAPI 入口、健康检查 `/healthz`、`/readyz`、统一异常 / 日志中间件
  - 验收：`uv run uvicorn app.main:app` 后两个端点返回 200；错误返回 RFC 7807 风格 JSON。
- [ ] **M0-T3** 接入 SQLAlchemy 2.x + Alembic，初始化 `alembic/env.py`、`migrations/0001_init.py`（仅扩展和 schema）
  - 验收：`alembic upgrade head` 在干净 PG 上成功；`alembic downgrade base` 反向也成功。
- [ ] **M0-T4** Pre-commit：ruff（lint+format）、mypy --strict、pytest -q（空套件即可）、conventional-commit hook
  - 验收：`pre-commit run --all-files` 全绿；故意提交一条不合规 commit message 被拦截。
- [ ] **M0-T5** Docker Compose 基础骨架：先拉起 `pg` + `redis` + `backend` + `worker`；`web` + `caddy` 在 M0-T6 / M0-T8b 完成后接入同一 compose
  - 验收：后端阶段 `docker compose up -d pg redis backend worker` 全部健康且 `curl localhost:8000/healthz` 200；M0 出口前 `docker compose up -d` 可拉起 `pg` + `redis` + `backend` + `worker` + `web` + `caddy`，所有容器健康，`curl localhost/healthz` 200。

#### 前端
- [ ] **M0-T6** Next.js 16 工程 `web/` 初始化，启用 App Router、React 19、Tailwind v4、shadcn init
  - 验收：`pnpm dev` 启动，根路由渲染 shadcn 默认 Button。
- [ ] **M0-T7** OpenAPI client codegen 流水线：`pnpm gen:api` 从 `http://localhost:8000/openapi.json` 生成 `web/lib/api/`
  - 验收：FastAPI 暴露空路由 `/api/v1/ping`；前端调用类型不报错。
- [ ] **M0-T8** ESLint flat + Prettier + Vitest + Playwright 基础脚手
  - 验收：`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` 全部跑通空套件。
- [ ] **M0-T8b** 前端 mock 流水线:MSW(Mock Service Worker)接入,以 OpenAPI codegen 的类型为约束生成 handlers
  - 验收:M5 之前后端接口缺位时,前端可全 mock 启动;`pnpm dev:mock` 启用 MSW。

#### 跨栈
- [ ] **M0-T9** 创建 `docs/decisions/` 目录与 ADR 索引模板（`README.md`），不复制 §14/§15 内容；后续跨阶段决议按 `ADR-NNN-<slug>.md` append-only 落档
  - 验收：`docs/decisions/README.md` 存在，首段写明"决议初值来源 = requirements §14/§15（含本期 16 项）+ 后续 ADR"；索引区列出当前 ADR 目录下所有 `ADR-*.md` 文件。
- [ ] **M0-T9b** 落档可观测性 metrics 命名 ADR（`docs/decisions/ADR-001-metrics-naming.md`），约定第一阶段 4 类核心 metric 的命名、标签集、单位、基数边界
  - 验收：ADR 文件存在；列出 `runs_total{skill,status,trigger}`、`alerts_total{priority,channel,state}`、`llm_tokens_total{provider,model,task_kind}`、`collector_failures_total{source,error_type}` 的语义、单位与禁止的高基数标签（如 `subject_id`）；M1–M6 中所有新增 metric 必须先 append 到此 ADR 才能注册到 Prometheus（M6-T2 验收会回溯检查）。

**M0 出口标准**：本地一键 `make dev` 能起完整栈；CI 在 push / PR 全绿；ADR 索引模板与 metrics 命名 ADR 落档。

---

### M1 · 数据层与领域模型

> **顺序约束**:`M1-T0 数据源 Spike` 必须先于本里程碑所有 schema migration 完成,以免 Spike 结果反过来推翻字段设计。

#### 数据源 Spike（前置）
- [ ] **M1-T0** 数据源 Spike：验证 akshare / Tushare / yfinance / FRED 的关键接口、字段覆盖、限流形态、失败形态、降级触发样本
  - 验收：`docs/tasks/1-task/data-source-spike.md` 记录 A 股行情 / 板块 / 财务 / 公告 PDF / 美股行情&财报 / FRED 指标的验证结果与降级策略;data-layer §8 降级矩阵每条都有"实际触发样本"。Spike 报告通过后 schema migration 才能进入 review。

#### 数据库
- [ ] **M1-T1** Migration 创建实体表：`stock`、`company`、`product`、`commodity`、`market_variable`、`market_event`
  - 验收：迁移成功；`pytest tests/data/test_schema_smoke.py` 通过（每张表 insert 一条假数据）。
- [ ] **M1-T2** Migration 创建 Sector 三表：`sector_canonical`、`sector_provider`、`sector_mapping` + `sector_membership`(默认阈值 `relevance × confidence ≥ 0.5`，单源默认 `confidence=0.8`、`relevance=0.7`，乘积 0.56)
  - 验收：三表外键、唯一约束齐；插入单源默认值的成员通过阈值校验；低于阈值的成员被标记 `eligible=false`（不直接拒绝，留待后续映射加权）。
- [ ] **M1-T3** Migration 创建 `evidence` 表（含 jsonb extra、hash 唯一索引、type+observed_at 索引）
  - 验收：往 `extra` 写 `stat` / `llm` 子结构能成功；hash 重复插入按 ON CONFLICT 处理。
- [ ] **M1-T4** Migration 创建关系边表 `edge`(按 architecture §3.2 schema),含 `relation_class`、`evidence[]`、`revoked_at`(支持软删除)
  - 验收：插入缺 `relation_class` 的边被 CHECK 约束拒绝；`revoke_conclusion` 单测通过。
- [ ] **M1-T5** Migration 创建指标表族（`financial_metric`、`market_metric`、`sector_metric`、`leader_score`、`impact_score`）
  - 验收：每表 `as_of` 与 `source` 必填；`leader_score` 含 `weight_template_version`、`baseline boolean`;提供查询视图 `v_latest_metric`。

#### Collector 接入
- [ ] **M1-T6** akshare 行情 / 资金流采集器（日线、北向、主力）
  - 验收：增量任务能补 1 个交易周；落库无重复（hash 去重）。
- [ ] **M1-T7** akshare 板块（行业 / 概念）成员采集器，写 `sector_provider` + `sector_mapping`（手工映射 canonical）
  - 验收：第一阶段 §12.2 涉及板块的 canonical id 已建立。
- [ ] **M1-T8** Tushare 财务字段补采（仅缺失字段）
  - 验收：开关 `TUSHARE_TOKEN` 为空时跳过、不报错。
- [ ] **M1-T9** yfinance 美股股价 / 财报采集器
  - 验收：能拉取 NVDA、TSLA、AAPL 一年日线 + 最近一份财报。
- [ ] **M1-T10** FRED 利率 / CPI 采集器
  - 验收：拉取 DGS10 与 CPIAUCSL 入 `market_variable`。
- [ ] **M1-T11** 公告 PDF 采集器（按需，先做 1–2 家公司样例）+ 落 `data/raw/announcements/`
  - 验收：PDF 落地、hash 去重；Evidence 行写入。

#### 领域服务
- [ ] **M1-T12** Repository 层：每个实体一个 Repository，统一 `get_by_id` / `find` / `upsert` / `attach_evidence`
  - 验收：单元测试覆盖率 ≥ 80%。
- [ ] **M1-T13** Evidence 服务：`record(type, payload) → evidence_id`；强制校验缺字段拒绝
  - 验收：缺 `observed_at` 时抛 `EvidenceValidationError`。
- [ ] **M1-T14** Conclusion Sink 服务实现(对应 domain-model §6):接收 `conclusions[]` → 校验 → 落 `edge` / `leader_score`,拒绝项写 trace;`revoke_conclusion(target_id, reason, by_evidence_id?)` 软删除（置 `revoked_at` / `revoked_reason` / `revoked_by`，不物理删除）
  - 验收:三类拒绝(missing_evidence / missing_relation_class / unknown_subject)单测覆盖;LLM 输出强制落 `inferred`;revoke 后 active 视图不再返回该记录但历史快照保留可审计;revoke 操作本身写入 `run.trace`。

#### 最小手工边录入
- [ ] **M1-T15** §12.2 五条美股 → A 股关键传导边的最小录入手段:CSV → SQL 脚本(`scripts/seed_manual_edges.py`),挂 `manual` evidence、标 `fact` class
  - 验收:脚本幂等,边数据进入 `edge` 表后被 M2 产业链分析器读取;正式录入工作流(UI / 校验)推迟到 M6-T1。

#### 运行时基础表
- [ ] **M1-T15b** Migration 创建运行时与会话基础表族（对应 architecture §3.3 / §6 与 runtime-layer §6.1）
  - `run(id UUID PK, skill, parent_run_id FK→run, trigger_source, status, started_at, finished_at, usage JSONB)`
  - `trace_event(run_id FK, idx, kind, payload JSONB, ts)`，索引 `(run_id, idx)`
  - `run_artifact(run_id FK PK, artifact_path, summary)`
  - `conversation_thread(id UUID PK, title, subject_ref JSONB, tags TEXT[], pinned, created_at, last_message_at, archived_at)`
  - `conversation_reference(thread_id FK, run_id FK, evidence_id FK?, message_idx)`
  - 验收：mock RunRequest 跑完后 `run` + `trace_event` + `run_artifact` 都有记录；`run.id` 与 `/runs/{date}/{skill}/{run_id}/` 文件目录路径互通；`conversation_thread` 软删除走 `archived_at`、不物理删除；`conversation_reference` 反查"哪些 thread 引用过此 Artifact"返回正确。

**M1 出口标准**:Spike 报告通过 → 执行一次"日终采集"脚本,覆盖 §12.2 全部板块和美股龙头;Evidence、Conclusion Sink、关系边强约束生效;§12.2 五条手工边已录入；运行时基础表与会话基础表迁移完成可承接 M2/M3/M5b。

---

### M2 · 核心 Skill

- [ ] **M2-T0** API payload schema 凝固：为下游核心端点定义 Pydantic 响应模型 + FastAPI router 占位（mock 数据），统一基于 architecture §5 Artifact + client §5 Subject Page 反推
  - 端点：`/api/v1/sectors/{id}/latest`（成员/龙头摘要/热度/`as_of`/`metric_coverage`）、`/api/v1/symbols/{code}/latest`（行情/五维分/长期价值标签/`weight_template_version`）、`/api/v1/runs/{run_id}` + `/api/v1/artifacts/{run_id}`（直接复用 Artifact schema）、`/api/v1/alerts` + `/api/v1/alerts/{id}`（含 `state` / `evidence[]` / `artifact_run_id` / `open_chat_thread_id`）、`/api/v1/strategies` + `/api/v1/strategies/{id}`
  - 验收：5 类端点 mock 返回通过 OpenAPI 校验；前端 `pnpm gen:api`（M0-T7）拉到的 TS 类型与 schema 一致；后续 M2 / M4 的 Skill / Notifier 实现只能补 schema 字段、不能改字段命名（变更须回此处统一改）。
- [ ] **M2-T1** Tool 注册中心：`get_kline`、`get_sector_members`、`get_company_metrics`、`query_edges`、`get_evidence`
  - 验收：每个 Tool 有 JSON schema、被 `LLMGateway` 注册可调用。
- [ ] **M2-T2** Skill：`板块中心`——成员、涨跌、资金、估值、热度
  - 验收：调用返回 Artifact，`charts`/`data` 与 architecture §5 schema 匹配。
- [ ] **M2-T3** Skill：`龙头识别器`——五维评分 + 板块类型化权重（周期/科技/消费/金融四套模板）+ 评分拆解快照
  - 验收：对"光模块、锂电池、消费电子、银行"四个板块输出前三龙头与拆解；评分快照写入 `leader_score`；输出 `metric_coverage`、缺失字段列表和 `weight_template_version`。
- [ ] **M2-T4** Skill：`长期价值评估`——基本面 + 估值分位 + 治理风险标签
  - 验收：对 5 只样本股票输出结论 Artifact，附置信度与 evidence。
- [ ] **M2-T5** Skill：`大盘看板` 与 `热点分析器`
  - 验收：日终一次跑完，落 `/skills/<skill>/latest.json`。
- [ ] **M2-T6** Skill：`产业链分析器`（基于手工边 + akshare 关联）
  - 验收：输入"中际旭创"，输出上下游/竞品/原材料/关键事件路径，证据可点开。

**M2 出口标准**：四类核心 Artifact 跑通；前端可消费 `latest.json` 渲染。

---

### M3 · LLMGateway + 文本抽取

- [ ] **M3-T1** `LLMGateway` 抽象：`Provider` 接口（OpenAI / Anthropic / DeepSeek / 通义 / 智谱 占位），统一 `messages`、`tools`、`stream`、`prompt_cache_key`
  - 验收：单测对每个 provider stub 跑通"hello + tool-call"。
- [ ] **M3-T2** 路由策略：按 `task_kind` × `latency_budget` 选 provider/model；Run 级 token / 调用次数上限作为失控兜底
  - 验收：超出上限时抛 `LLMRunLimitExceededError`，写入 trace。
- [ ] **M3-T3** Prompt cache：所有 system prompt 与 retrieval 段开 cache，cache_key 落 trace
  - 验收：连续两次相同请求第二次 token 数下降到 cache 区间。
- [ ] **M3-T4** Tool：`extract_filing(text|pdf_path)`——抽取主体 / 产品 / 客户 / 订单 / 风险 / 业绩预期，落 `inferred` evidence
  - 验收:3 份样本公告抽取召回率人工抽检 ≥ 80%;输出附 `model + prompt_hash + temperature`;固化 golden set 到 `tests/llm_fixtures/extract_filing/`(样本输入 + 期望抽取字段),作为换 prompt / 换模型的回归基线。
- [ ] **M3-T5** Skill：`公告事件解读`——基于抽取结果产出"受益/承压对象 + 观察指标"
  - 验收：对一则英伟达财报新闻输出 Artifact 包含至少 3 条 A 股板块影响路径。
- [ ] **M3-T6** Skill：`轻量 NL 问答` 入口（先支持"板块/龙头/上下游/事件"4 类意图）
  - 验收：对 5 条问题样本回复均带 evidence 引用。

**M3 出口标准**：LLMGateway 接入 ≥ 2 家 provider；抽取与 NL 问答跑通 e2e；trace 含 token / 调用次数 / latency。

---

### M4 · 调度与提醒

- [ ] **M4-T0** Migration 创建 `alert_record` 表（M4-T1 / T4 / T5 与 orchestration §4.3 日报兜底的共同前置）
  - 字段：`alert_id UUID PK, rule_id, subject_type, subject_id, priority enum(high|medium|low), state enum(active|capped|deferred|suppressed|sent|merged), evidence UUID[], artifact_run_id, open_chat_thread_id, parent_alert_id (合并指向自身), channels JSONB, created_at, sent_at`
  - 验收：迁移成功；构造 100 条假候选 → M4-T4 三重闸能正确将 state 置 `sent` / `merged` / `capped` / `deferred` / `suppressed`；orchestration §4.3 日报兜底能查询当日 `state ∈ {capped, deferred, suppressed}` 记录。
- [ ] **M4-T1** Scheduler：APScheduler 定时（日终）+ Celery 重任务 / 文本到达事件触发
  - 验收：日终任务在测试环境定点跑完；公告投递 → Skill 触发延迟 < 30s。
- [ ] **M4-T2** 策略 DSL：`RuleParser`（YAML/JSON → AST）+ `ExpressionEvaluator` + `VariableResolver`（metric/relation/event/sector/symbol）；版本化指标(如 `leader_score`)的 `changed` / `changed_by` 默认仅在同一 `weight_template_version` 内比较,模板切换的首条快照视为 `baseline` 不触发,跨版本回放需显式 `cross_template: true`(对应 orchestration-layer §3.4)
  - 验收：requirements §14.9 示例规则能 parse + evaluate 返回正确 bool；`within(window)` 行为正确;构造一组跨 `weight_template_version` 的快照,默认行为不误报;`cross_template: true` 时正常触发。AlertCandidate 输出携带 `weight_template_version`。
- [ ] **M4-T3** 内置策略集（用 DSL 写）：龙头排名变化、板块异动、美股联动、公告事件、长期价值阈值
  - 验收：在历史数据上回放，至少 3 条策略命中样本事件。
- [ ] **M4-T4** 提醒服务三重闸：去重（30min 窗）+ 合并（1h 摘要包）+ 静默时段 + 每日上限
  - 验收：单测覆盖每个闸的边界；构造 100 条假候选 → 实际推送 ≤ 上限。
- [ ] **M4-T5** Notifier：飞书机器人、电报 Bot、Web 站内通知（写表 `alert_record`）
  - 验收：三个渠道在 staging 都能收到一条带 evidence 链的提醒。
- [ ] **M4-T6** 提醒回看 API：`GET /api/v1/alerts`，含上下文与后续走势字段
  - 验收：OpenAPI 文档同步；前端可消费。

**M4 出口标准**：策略 DSL + 提醒三重闸 + 三渠道发送在 staging 联调通过。

---

### M5a · Web 客户端 · 看板线

- [ ] **M5a-T1** 路由结构(看板部分):`/`、`/analysis/market`、`/analysis/sector/{id}`、`/analysis/stock/{code}`、`/analysis/event/{id}`、`/artifacts/{run_id}`
  - 验收:RSC 渲染、loading / error 边界齐;mock 数据下可独立运行(MSW)。
- [ ] **M5a-T2** 主页:今日要点流 + 关注画像迷你卡(板块/个股)+ 持续观察
  - 验收:对接 `/api/v1/alerts` + `/api/v1/sectors/{id}/latest` + `/api/v1/symbols/{code}/latest`;空态 onboarding 提示齐。
- [ ] **M5a-T3** 板块总览表(虚拟滚动)+ 排序 / 筛选 + 龙头摘要
  - 验收:1000+ 板块行流畅;选中板块跳转详情。
- [ ] **M5a-T4** 龙头榜页:五维评分拆解(ECharts 雷达图)+ 入选原因 + 风险标签 + Evidence 抽屉
  - 验收:对 §12.2 板块都能渲染;Evidence 抽屉可展开 PDF / 链接;显示 `weight_template_version`、`metric_coverage`。
- [ ] **M5a-T5** 产业链图(Cytoscape.js):节点按类型着色、边按 `strength × confidence` 加粗、过期边降饱和
  - 验收:以中际旭创为中心展开 3 度邻居流畅;点击节点弹证据。
- [ ] **M5a-T6** 跨市场影响图:事件 → A 股板块 → 个股的传导路径
  - 验收:英伟达事件输入,路径与 evidence 联动展开。
- [ ] **M5a-T7** 提醒中心:列表 + 详情 + 上下文 + 后续走势小图
  - 验收:可标记已读 / 收藏;过滤优先级。

**M5a 出口标准**:看板线四类核心视图全部走通,可在真实日终数据上跑通。

---

### M5b · Web 客户端 · 对话线 + 策略

- [ ] **M5b-T1** 路由结构(对话部分):`/chat`、`/chat/{thread_id}`、`/strategy`、`/strategy/skills`、`/strategy/{id}`
  - 验收:RSC 渲染、错误边界齐。
- [ ] **M5b-T2** Chat 多 thread:左侧列表(命名/置顶/标签)+ 右侧消息流;对接 `conversation_thread` PG 索引 + `messages.jsonl` 文件正文
  - 验收:thread 列表分页;归档 / 恢复正常;引用反查 API 通。
- [ ] **M5b-T3** Chat 流式回答:SSE 通道(FastAPI 端) + 客户端组件 streaming;tool-call trace 折叠展开;token 用量显示
  - 验收:5 条样本问题问答顺畅;断流可恢复。
- [ ] **M5b-T4** Artifact 内联渲染:`summary` + `highlights` 富卡片;`charts[]` 用 ECharts/Cytoscape 直接画;`conclusions[]` 按 relation_class 色标 + 置信度条 + evidence 列表;重视图全屏 `/artifacts/{run_id}`
  - 验收:三类 relation_class 色标正确;evidence 可点开 PDF / 链接 / 摘录。
- [ ] **M5b-T5** 策略页 · 我的策略:列表 + 详情(命中历史、最近 Artifact、命中分布、暂停/启用)
  - 验收:对接 `/api/v1/strategies` + `/api/v1/alerts?strategy_id=` 联动。
- [ ] **M5b-T6** 策略页 · NL → DSL 创建表单:LLM 转 DSL 草稿 → 可视化卡片 → 用户确认/微调 → 落库
  - 验收:requirements §14.9 示例自然语言可成功转 DSL 并启用。
- [ ] **M5b-T7** Chat → Strategy 凝固:任意 thread "保存为策略",LLM 读取上下文转草稿并跳转策略页预填
  - 验收:从 chat 生成的 DSL 落库后能命中下一次定时跑。
- [ ] **M5b-T8** Skill 库 tab + Cmd+K + 铃铛(全局)
  - 验收:Skill 卡片显示启用/调用统计;Cmd+K 跳转 subject 与 Artifact;铃铛跨页面工作。
- [ ] **M5b-T9** Playwright E2E:5 条核心路径(板块查询、龙头展开、跨市场分析、提醒中心、Chat 保存为策略)
  - 验收:CI 中跑通。

**M5b 出口标准**:对话线 + 策略闭环走通;`pnpm test:e2e` 在 CI 全绿。

---

### M6 · 集成与上线

- [ ] **M6-T1** §12.2 五条美股 → A 股映射边的**正式录入工作流**(在 M1-T15 临时脚本基础上,提供 CSV 模板 + 校验 + diff 预览;评估是否需要轻量 UI)
  - 验收：录入工具有变更日志;`edge` 表中存在并被产业链/影响图正确渲染;失效降权流程演练通过。
- [ ] **M6-T2** 可观测性：结构化日志（loguru）、Prometheus metrics（FastAPI / Celery / LLMGateway / Collector），按 M0-T9b 落档的 metrics 命名 ADR 注册
  - 验收：`/metrics` 暴露 ADR 中列出的全部 4 类核心 metric；新增 metric 在 PR 中均可回溯到 ADR 对应章节；本地 Grafana 模板渲染并展示 `runs_total` / `alerts_total` / `llm_tokens_total` / `collector_failures_total` 4 张图。
- [ ] **M6-T3** 备份：`pg_dump` 每日落 `data/backups/`；`data/raw/` 增量打包
  - 验收：模拟 PG 损坏后从备份恢复成功。
- [ ] **M6-T4** 单机部署：Docker Compose 生产 profile + Caddy（`/api/*` → backend，其他 → web）+ HTTPS
  - 验收：从空机一键 `make deploy`，3 分钟内可用。
- [ ] **M6-T5** README + RUNBOOK：起跑、停跑、备份、应急、Token 替换
  - 验收：陌生人按文档能在 30 分钟内本机部署。

**M6 出口标准**：单机部署可用；运行手册齐；可独立运维 7 天。

---

## 六、当前状态

- **2026-05-08 初稿**:plan-phase 初稿完成,7 里程碑 49 任务。
- **2026-05-08 第一轮 review 修订**:数据源 Spike 前置、最小手工边录入(`M1-T15`)、Conclusion Sink 任务(`M1-T14`)、M5 拆 a/b、MSW(`M0-T8b`)、golden fixtures(`M3-T4`)、DSL 版本化语义、降级矩阵、Thread 持久化分层、概念污染阈值缺省 0.5、principles 目录约定补全。8 个里程碑(M0/M1/M2/M3/M4/M5a/M5b/M6)、66 条任务,总估时 12.5 周。
- **2026-05-08 第二轮自检**:任务编号无冲突,跨文档引用闭环(详见 §九),无悬空链接。
- **2026-05-08 第二轮 review 修订**:发现 13 项可执行性盲点(阈值数学矛盾、龙头权重数值缺失、产业链地位维度第一阶段口径、货币 / 时区跨市场约束、Artifact 字段边界、日报机制、ADR-001 价值、Sector ID 命名 / Cmd+K / API key 加载 / 测试金字塔等),全部已落到对应 requirements / design 文档,plan-phase 同步 M0-T9、M1-T2,以及目录重命名 `1-mcp → 1-task` 内部引用刷新;详见 §9.2。
- **2026-05-08 第三轮 review 修订**:补全设计文档中已规定但 plan-phase 未单列的 5 类基础任务(metrics 命名 ADR、运行时/会话表迁移、API payload schema 凝固、`alert_record` 迁移、`revoke_conclusion` 接口契约);新增 M0-T9b、M1-T15b、M2-T0、M4-T0,扩展 M1-T14 / M6-T2 验收;任务总数从 65 增至 69(此前历史登记的 66 为计数误差,已校正),估时仍 12.5 周(落入原 ~20% 缓冲);详见 §9.3。
- **2026-05-08 第四轮小修**:修正 M0-T5 与前端脚手的执行顺序依赖,将 metrics ADR 文件名明确为 `ADR-001-metrics-naming.md`,统一运行时表字段口径为 `run.id`;不改变任务范围与任务总数,详见 §9.4。
- `docs/requirements/1.requirements.md` 与 `docs/design/architecture.md` 已同步纳入 16 项决议。
- 全部任务状态:`pending`,**待用户终审通过后**进入 build phase。

---

## 七、决策记录

本 phase 期间的关键决策（来自 brainstorming）：

| 序号 | 决策 | 摘要 | 链接 |
|---|---|---|---|
| D-01 | 服务端技术栈 | Python / FastAPI / APScheduler / Celery | requirements §14.1 |
| D-02 | 存储 | PG + JSONB + 文件 | requirements §14.2 |
| D-03 | LLM 接入 | 多云 + 内部 LLMGateway | requirements §14.3 |
| D-04 | 数据源 | akshare 主 + Tushare 补；yfinance + FRED | requirements §14.4 |
| D-05 | 板块来源 | 多源并存 + canonical 映射 | requirements §14.5 |
| D-06 | Evidence | 全字段 schema + 类型子字段 | requirements §14.6 |
| D-07 | 抽取分工 | 规则=数字 / LLM=文本 / 手工=高价值边 | requirements §14.7 |
| D-08 | 龙头评分 | 模板权重 + 拆解 + 后期回测 | requirements §14.8 |
| D-09 | 策略 DSL | YAML/JSON 表达式 | requirements §14.9 |
| D-10 | 提醒疲劳 | 去重 + 合并 + 静默 + 每日上限 | requirements §14.10 |
| D-11 | 前端框架 | Next.js 16 RSC | requirements §15.1 |
| D-12 | UI 库 | shadcn/ui + Tailwind v4 | requirements §15.2 |
| D-13 | 可视化 | ECharts + Cytoscape.js | requirements §15.3 |
| D-14 | 前后端契约 | REST + OpenAPI 生成 TS 客户端 | requirements §15.4 |
| D-15 | 数据层 | TanStack Query + Zustand | requirements §15.5 |
| D-16 | 工程化 | pnpm + ESLint flat + Vitest + Playwright | requirements §15.6 |
| D-17 | 文档目录 | requirements / design / tasks 三库分离 | principles.md |
| D-18 | 部署 | 单机 Docker Compose + Caddy | architecture §3.6 / 本文 §三 |

---

## 八、未决问题

> 这些事项不阻塞本 plan 通过，但会在后续 phase 中需要展开决策。

1. **Tushare 是否启用、用哪些字段**？目前 M1-T8 设为可选；启用与否取决于数据源 Spike 与 akshare 财务字段缺口，M1 完成后回看决定。
2. **板块 canonical 命名空间种子数据**：第一批 canonical sector 列表谁来定？建议 M1-T7 期间先按"行业 + §12.2 概念"建出最小集，后续逐步扩。
3. **LLM 提供商账号准备**:用户直接提供 API key(含主备至少各一);Gateway 仅做多云抽象、路由、prompt cache、调用追踪,不做成本预算。Run 级 `max_tool_calls` / `max_tokens` 与 provider 错误率熔断仍保留,作为防止失控调用和供应商故障扩散的工程兜底。
4. **飞书 / 电报机器人申请**：飞书自建机器人 webhook、Telegram Bot Token 需要用户提前申请并提供。
5. **盘中数据范围**：第一阶段只覆盖"少量盘中关键指标"——具体哪几项？建议 M2 完成后基于 Skill 实际需要回填。
6. **手工边维护工作流**：UI / CSV 导入 / 直接 SQL？M6-T1 之前需要决定形式。
7. **回测子系统时间表**：第二阶段才做，但权重模板初值是否需要先做"快速回测"作为合理性检查？
8. **国际化 / 多用户**：明确不做（requirements §2 / §12.3），但 i18n 键值仍建议从 M5 开始养成习惯。

---

## 九、Review 结论

> 通过流程：评审人逐项给出意见 → 全部 must-fix 项处理后,在结论行写"通过 + 日期",本 phase 结束,进入 `2-build-phase.md`。
> 单人项目时评审人 = 用户本人,把"自审"也走一遍流程,避免遗漏。

### 9.1 第一轮评审(2026-05-08)

- 评审人:用户
- 评审范围:plan-phase 初稿
- 主要意见与处置:

| # | 意见 | 处置 | 落点 |
|---|---|---|---|
| R1-01 | 数据源 Spike 应前置于 schema migration | 已修订:Spike 改为 `M1-T0`,新增"顺序约束"说明 | M1 |
| R1-02 | 产业链分析器(M2)与手工边录入(M6)存在闭环依赖 | 已修订:新增 `M1-T15` 最小录入脚本,M6-T1 收敛为"正式工作流" | M1 / M6 |
| R1-03 | M5 范围过大,2 周不现实 | 已修订:拆为 M5a 看板线 + M5b 对话线,各 1.5 周 | M5a / M5b |
| R1-04 | 策略 DSL 与 leader_score 版本化语义未对齐 | 已修订:orchestration §3.4 显式语义,M4-T2 加跨版本验收 | design / M4-T2 |
| R1-05 | 概念污染阈值未给数 | 已修订:第一阶段缺省 0.5 | requirements §14.5 / M1-T2 |
| R1-06 | Conclusion Sink 实现形态未指定 | 已修订:domain-model §6 + `M1-T14` 验收明确 | design / M1-T14 |
| R1-07 | 数据源失败降级路径缺失 | 已修订:data-layer §8 降级矩阵 6 类场景 | design / M1-T0 |
| R1-08 | Chat thread 持久化分裂(文件 vs 表) | 已修订:runtime-layer §6.1 PG 索引 + 文件正文分层 | design / M5b-T2 |
| R1-09 | LLM 月度成本估算 | 取消:用户直接提供 API key,Gateway 不做成本预算;保留 token / 调用次数失控兜底 | runtime-layer §7 |
| R1-10 | 前端 mocking 缺失 | 已修订:`M0-T8b` MSW 接入 | M0 |
| R1-11 | LLM 抽取回归测试集 | 已修订:`M3-T4` 加 golden fixtures | M3 |
| R1-12 | principles 目录约定与现状不符 | 已修订:补 modules / tasks / decisions 命名规范 | principles.md |

- 评审结论:
  - [x] 第一轮意见已全部处置
  - [ ] **用户终审通过**(签字行)
  - 终审日期:
  - 终审备注:

### 9.2 第二轮评审(2026-05-08)

- 评审人:用户(由 Claude 协助审视)
- 评审范围:requirements + architecture + 6 个 modules + 本 plan-phase 的可执行性
- 主要意见与处置:

| # | 意见 | 处置 | 落点 |
|---|---|---|---|
| R2-01 | §14.5 阈值 0.5 与单源默认 0.7 × 0.7 = 0.49 数学矛盾 | 默认调整为 `confidence=0.8`、`relevance=0.7`(乘积 0.56) | requirements §14.5 / M1-T2 |
| R2-02 | 四套权重模板缺具体数值,M2-T3 无法直接落地 | 在 analysis-layer §3 给出 default + 4 套 profile 的百分比矩阵,标"M1-T0 后回测校准" | analysis-layer §3 / requirements §4.2 cross-ref |
| R2-03 | 第一阶段产业链地位维度大概率为 null,综合分失真未声明 | 在 analysis-layer §3.1 末尾补"第一阶段现实"段,明确大部分板块龙头评分实质 4 维 | analysis-layer §3.1 |
| R2-04 | 货币与时区跨市场未统一约束 | domain-model §2.3 加 `currency` 字段;data-layer §5 明确"PG 存 UTC,展示 Asia/Shanghai",并给出 A 股 / 美股交易日历来源 | domain-model / data-layer |
| R2-05 | Artifact `conclusions` vs `data` 边界不清,Sink 易重复落库 | architecture §5 加"字段边界"段,明确 conclusions 经 Sink 落图谱、data 仅展示 | architecture §5 |
| R2-06 | 提醒"超限走日报"机制未实现 | orchestration §4.3 新增日报兜底,触发时间 17:00、独立 webhook、空态不发 | orchestration §4.3 |
| R2-07 | 持续观察对事件流策略无法定义"距离" | client §3 限定为阈值类策略 | client §3 |
| R2-08 | LeaderScore 跨 `weight_template_version` 趋势线断档误读 | client §5.4 默认仅展示当前版本,模板切换以 baseline 起点新建,旧版本灰色折叠 | client §5.4 |
| R2-09 | ADR-001 复制 §14/§15 内容价值不清 | M0-T9 改为创建 `docs/decisions/README.md` 索引模板,不复制内容 | plan-phase M0-T9 |
| R2-10 | Cmd+K 在 client 标"可选"但 M5b-T8 列入验收,矛盾 | client §7.2 移除"可选" | client §7.2 |
| R2-11 | Sector canonical id 命名规则未约定 | domain-model §2.1 加命名规则段(`BK_*` / `RG_*` / `TH_*`) | domain-model §2.1 |
| R2-12 | API key / 飞书 token 加载机制未明 | runtime-layer §7.1 新增凭证加载段(env / 主备 / 不入库 / 重启轮换) | runtime-layer §7.1 |
| R2-13 | 测试金字塔策略层缺失 | architecture §11 新增"测试与验证策略",涵盖单元/集成/LLM 回归/E2E 与关键不变量用例 | architecture §11 |
| R2-14 | 目录重命名后 plan-phase / architecture 内引用未刷新 | M1-T0、§十 与 architecture 文末三处 `1-mcp` 改为 `1-task` | plan-phase / architecture |

- 评审结论:
  - [x] 第二轮意见已全部处置
  - [ ] **用户终审通过**(签字行)
  - 终审日期:
  - 终审备注:

### 9.3 第三轮评审(2026-05-08)

- 评审人:用户(询问"plan-phase 是否覆盖所有设计")
- 评审范围:plan-phase 与 design 各模块的完整性映射
- 主要意见与处置:

| # | 意见 | 处置 | 落点 |
|---|---|---|---|
| R3-01 | metrics 命名规范跨多个里程碑使用,但无 ADR | 新增 `M0-T9b` 落档 metrics 命名 ADR;M6-T2 验收回溯检查 | M0-T9b / M6-T2 |
| R3-02 | `run` / `trace_event` / `run_artifact` 表 architecture §3.3+§6 已设计但无 migration 任务 | 新增 `M1-T15b` 运行时基础表迁移(同时含 `conversation_thread` / `conversation_reference`,对接 M5b-T2) | M1-T15b |
| R3-03 | API payload schema 散落在各 Skill / Notifier 任务,无统一锚定 | 新增 `M2-T0` API payload schema 凝固,Pydantic 模型一次性定义 5 类核心端点 | M2-T0 |
| R3-04 | `alert_record` 表 M4-T5 直接使用但无 migration 任务 | 新增 `M4-T0` 在 M4-T1 之前完成迁移,字段对齐 orchestration §4.3 日报状态机 | M4-T0 |
| R3-05 | `revoke_conclusion` 接口契约 M1-T14 仅一笔带过 | 扩展 M1-T14 验收,显式契约 + 历史快照保留 + trace 写入 | M1-T14 |
| R3-06 | 第一阶段范围口径 plan-phase 未显式声明 | §一 已说"覆盖第一阶段全量功能";requirements §13 第二/三阶段不在范围(此条仅做记录,不改动) | — |

- 评审结论:
  - [x] 第三轮意见已全部处置
  - [ ] **用户终审通过**(签字行)
  - 终审日期:
  - 终审备注:

### 9.4 第四轮小修(2026-05-08)

- 评审人:用户(询问"是否具备可执行条件")
- 评审范围:plan-phase 的执行顺序、文件命名与字段一致性
- 主要意见与处置:

| # | 意见 | 处置 | 落点 |
|---|---|---|---|
| R4-01 | M0-T5 要求完整 Docker Compose,但 `web/` 在 M0-T6 才创建,存在顺序依赖 | M0-T5 改为"基础 compose 先起后端依赖,完整 compose 在 M0 出口验收" | M0-T5 |
| R4-02 | `ADR-NNN-metrics-naming.md` 是占位文件名,执行者可能照字面创建 | 明确为 `ADR-001-metrics-naming.md` | M0-T9b |
| R4-03 | M1-T15b schema 使用 `run.id`,验收写 `run.run_id`,字段口径不一致 | 统一验收口径为 `run.id` | M1-T15b |

- 评审结论:
  - [x] 第四轮小修已全部处置
  - [ ] **用户终审通过**(签字行)
  - 终审日期:
  - 终审备注:

---

## 十、下一步动作（仅在 Review 通过后执行）

1. 创建 `docs/tasks/1-task/2-build-phase.md`，从 M0 开始。
2. 在 git 上拉新分支 `feat/m0-baseline`。
3. 按 M0 任务表逐项实施，每完成一项就在本文件勾选。
4. 任一里程碑结束后发起 review，结论回写到本文件 §九。
