# Task 1 · MCP · Plan Phase

> 本文件遵循 `docs/principles.md` 的 phase 文件结构。完成本 phase 的标志：用户对本文件签字确认，方可进入 build phase。

---

## 一、目标

把 `docs/requirements/1.requirements.md` 与 `docs/design/architecture.md` 中已敲定的 16 项决议拆解为可执行任务，**输出一份覆盖 MVP 全量功能的实施规划**，让任意接手者只需读本文件 + requirements + architecture 即可独立开工。

具体产物：
- 7 个里程碑（M0–M6）的任务清单，每条任务带验收标准与依赖关系。
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
| 存储 | PostgreSQL 16 · JSONB · 本地文件系统 |
| LLM | 多云 + 自建 `LLMGateway`（统一 messages / function-call / cache / batch / 计费） |
| 数据源 | akshare（主）· Tushare（补）· yfinance · FRED · 自有 RSS/PDF |
| 前端 | Next.js 16（App Router · RSC）· React 19 · Tailwind v4 · shadcn/ui · ECharts · Cytoscape.js · TanStack Query · Zustand |
| 工程化 | uv（Python 包管理）· pnpm（Node）· ruff · mypy · pytest · ESLint flat · Prettier · Vitest · Playwright |
| 部署 | 单机 Docker Compose（pg + backend + worker + web + caddy） |

---

## 四、里程碑划分

| 里程碑 | 主题 | 关键产出 | 估时 |
|---|---|---|---|
| **M0** | 工程基线 | 仓库结构、CI、本地起跑、基础 schema | 1 周 |
| **M1** | 数据层与领域模型 | Collector + 实体表 + Evidence + Sector 三表 + 指标 | 2 周 |
| **M2** | 核心 Skill | 板块中心、龙头识别、长期价值、大盘/热点 | 2 周 |
| **M3** | LLMGateway + 文本抽取 | Gateway 多云路由、公告抽取、轻量 NL 问答 | 1.5 周 |
| **M4** | 调度与提醒 | Scheduler、策略 DSL 引擎、提醒三重闸、飞书/电报 | 1.5 周 |
| **M5** | Web 客户端 | 板块/龙头/产业链/影响图/提醒中心五屏 | 2 周 |
| **M6** | 集成与上线 | 跨市场映射手工边、E2E、可观测性、单机部署 | 1 周 |

总估时约 11 周（单人节奏，含 ~20% 缓冲）。

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
- [ ] **M0-T5** Docker Compose：`docker-compose up` 拉起 `pg` + `backend` + `worker` + `web` + `caddy`
  - 验收：`docker compose up -d`，所有容器健康；`curl localhost/healthz` 200。

#### 前端
- [ ] **M0-T6** Next.js 16 工程 `web/` 初始化，启用 App Router、React 19、Tailwind v4、shadcn init
  - 验收：`pnpm dev` 启动，根路由渲染 shadcn 默认 Button。
- [ ] **M0-T7** OpenAPI client codegen 流水线：`pnpm gen:api` 从 `http://localhost:8000/openapi.json` 生成 `web/lib/api/`
  - 验收：FastAPI 暴露空路由 `/api/v1/ping`；前端调用类型不报错。
- [ ] **M0-T8** ESLint flat + Prettier + Vitest + Playwright 基础脚手
  - 验收：`pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e` 全部跑通空套件。

#### 跨栈
- [ ] **M0-T9** 创建 `docs/decisions/`，登记 ADR-001（本期 16 项决议合并稿，链回 requirements §14/§15）
  - 验收：ADR 文件存在、被 README 索引。

**M0 出口标准**：本地一键 `make dev` 能起完整栈；CI 在 push / PR 全绿；ADR-001 落档。

---

### M1 · 数据层与领域模型

#### 数据库
- [ ] **M1-T1** Migration 创建实体表：`stock`、`company`、`product`、`commodity`、`market_variable`、`market_event`
  - 验收：迁移成功；`pytest tests/data/test_schema_smoke.py` 通过（每张表 insert 一条假数据）。
- [ ] **M1-T2** Migration 创建 Sector 三表：`sector_canonical`、`sector_provider`、`sector_mapping` + `sector_membership`
  - 验收：三表外键、唯一约束齐；`relevance × confidence` 默认值合理。
- [ ] **M1-T3** Migration 创建 `evidence` 表（含 jsonb extra、hash 唯一索引、type+observed_at 索引）
  - 验收：往 `extra` 写 `stat` / `llm` 子结构能成功；hash 重复插入按 ON CONFLICT 处理。
- [ ] **M1-T4** Migration 创建关系边表 `edge`（按 architecture §3.2 schema），含 `relation_class`、`evidence[]`
  - 验收：插入缺 `relation_class` 的边被 CHECK 约束拒绝。
- [ ] **M1-T5** Migration 创建指标表族（`financial_metric`、`market_metric`、`sector_metric`、`leader_score`、`impact_score`）
  - 验收：每表 `as_of` 与 `source` 必填；提供查询视图 `v_latest_metric`。

#### Collector 接入
- [ ] **M1-T6** akshare 行情 / 资金流采集器（日线、北向、主力）
  - 验收：增量任务能补 1 个交易周；落库无重复（hash 去重）。
- [ ] **M1-T7** akshare 板块（行业 / 概念）成员采集器，写 `sector_provider` + `sector_mapping`（手工映射 canonical）
  - 验收：MVP §12.2 涉及板块的 canonical id 已建立。
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

**M1 出口标准**：执行一次"日终采集"脚本，覆盖 §12.2 全部板块和美股龙头；Evidence、关系边强约束生效。

---

### M2 · 核心 Skill

- [ ] **M2-T1** Tool 注册中心：`get_kline`、`get_sector_members`、`get_company_metrics`、`query_edges`、`get_evidence`
  - 验收：每个 Tool 有 JSON schema、被 `LLMGateway` 注册可调用。
- [ ] **M2-T2** Skill：`板块中心`——成员、涨跌、资金、估值、热度
  - 验收：调用返回 Artifact，`charts`/`data` 与 architecture §5 schema 匹配。
- [ ] **M2-T3** Skill：`龙头识别器`——五维评分 + 板块类型化权重（周期/科技/消费/金融四套模板）+ 评分拆解快照
  - 验收：对"光模块、锂电池、消费电子、银行"四个板块输出前三龙头与拆解；评分快照写入 `leader_score`。
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
- [ ] **M3-T2** 路由策略：按 `task_kind` × `latency_budget` × `cost_budget` 选 provider/model；Run 级 token / 调用 / $ 上限
  - 验收：超出 budget 时抛 `LLMBudgetExceededError`，写入 trace。
- [ ] **M3-T3** Prompt cache：所有 system prompt 与 retrieval 段开 cache，cache_key 落 trace
  - 验收：连续两次相同请求第二次 token 数下降到 cache 区间。
- [ ] **M3-T4** Tool：`extract_filing(text|pdf_path)`——抽取主体 / 产品 / 客户 / 订单 / 风险 / 业绩预期，落 `inferred` evidence
  - 验收：3 份样本公告抽取召回率人工抽检 ≥ 80%；输出附 `model + prompt_hash + temperature`。
- [ ] **M3-T5** Skill：`公告事件解读`——基于抽取结果产出"受益/承压对象 + 观察指标"
  - 验收：对一则英伟达财报新闻输出 Artifact 包含至少 3 条 A 股板块影响路径。
- [ ] **M3-T6** Skill：`轻量 NL 问答` 入口（先支持"板块/龙头/上下游/事件"4 类意图）
  - 验收：对 5 条问题样本回复均带 evidence 引用。

**M3 出口标准**：LLMGateway 接入 ≥ 2 家 provider；抽取与 NL 问答跑通 e2e；trace 含 token/cost/latency。

---

### M4 · 调度与提醒

- [ ] **M4-T1** Scheduler：APScheduler 定时（日终）+ Celery 重任务 / 文本到达事件触发
  - 验收：日终任务在测试环境定点跑完；公告投递 → Skill 触发延迟 < 30s。
- [ ] **M4-T2** 策略 DSL：`RuleParser`（YAML/JSON → AST）+ `ExpressionEvaluator` + `VariableResolver`（metric/relation/event/sector/symbol）
  - 验收：requirements §14.9 示例规则能 parse + evaluate 返回正确 bool；`within(window)` 行为正确。
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

### M5 · Web 客户端

- [ ] **M5-T1** 路由结构：`/`（大盘+热点）、`/sectors`、`/sectors/[id]`、`/symbols/[code]`、`/alerts`、`/qa`
  - 验收：所有路由 RSC 渲染、loading / error 边界齐。
- [ ] **M5-T2** 板块总览表（虚拟滚动）+ 排序 / 筛选 + 龙头摘要
  - 验收：1000+ 板块行流畅；选中板块跳转详情。
- [ ] **M5-T3** 龙头榜页：五维评分拆解（ECharts 雷达图）+ 入选原因 + 风险标签 + Evidence 抽屉
  - 验收：对 §12.2 板块都能渲染；Evidence 抽屉可展开 PDF / 链接。
- [ ] **M5-T4** 产业链图（Cytoscape.js）：节点按类型着色、边按 `strength × confidence` 加粗、过期边降饱和
  - 验收：以中际旭创为中心展开 3 度邻居流畅；点击节点弹证据。
- [ ] **M5-T5** 跨市场影响图：事件 → A 股板块 → 个股的传导路径
  - 验收：英伟达事件输入，路径与 evidence 联动展开。
- [ ] **M5-T6** 提醒中心：列表 + 详情 + 上下文 + 后续走势小图
  - 验收：可标记已读 / 收藏；过滤优先级。
- [ ] **M5-T7** 自然语言问答页（M3 已就绪）：流式回答 + Evidence 引用展开
  - 验收：5 条样本问题问答顺畅；token 使用量显示。
- [ ] **M5-T8** Playwright E2E：4 条核心路径（板块查询、龙头展开、跨市场分析、提醒中心）
  - 验收：CI 中跑通。

**M5 出口标准**：四类核心视图全部走通；`pnpm test:e2e` 在 CI 全绿。

---

### M6 · 集成与上线

- [ ] **M6-T1** 手工录入 §12.2 五条美股 → A 股映射的关键边（`fact` class）
  - 验收：`edge` 表中存在并被产业链/影响图正确渲染。
- [ ] **M6-T2** 可观测性：结构化日志（loguru）、Prometheus metrics（FastAPI / Celery / LLMGateway）
  - 验收：`/metrics` 暴露关键计数；本地 Grafana 模板渲染。
- [ ] **M6-T3** 备份：`pg_dump` 每日落 `data/backups/`；`data/raw/` 增量打包
  - 验收：模拟 PG 损坏后从备份恢复成功。
- [ ] **M6-T4** 单机部署：Docker Compose 生产 profile + Caddy（`/api/*` → backend，其他 → web）+ HTTPS
  - 验收：从空机一键 `make deploy`，3 分钟内可用。
- [ ] **M6-T5** README + RUNBOOK：起跑、停跑、备份、应急、Token 替换
  - 验收：陌生人按文档能在 30 分钟内本机部署。

**M6 出口标准**：单机部署可用；运行手册齐；可独立运维 7 天。

---

## 六、当前状态

- **2026-05-08**：plan-phase 初稿完成。共 7 个里程碑、48 个任务。
- requirements.md 与 architecture.md 已同步纳入 16 项决议。
- 全部任务状态：`pending`，**待用户评审通过后**进入 build phase。

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

1. **Tushare 是否启用、用哪些字段**？目前 M1-T8 设为可选；启用与否取决于 akshare 财务字段缺口实际有多大，M1 完成后回看决定。
2. **板块 canonical 命名空间种子数据**：第一批 canonical sector 列表谁来定？建议 M1-T7 期间先按"行业 + §12.2 概念"建出最小集，后续逐步扩。
3. **LLM 提供商账号准备**：MVP 至少需要 1 主 1 备。需要用户提供 token，并明确成本预算（建议月 ≤ ¥X）。
4. **飞书 / 电报机器人申请**：飞书自建机器人 webhook、Telegram Bot Token 需要用户提前申请并提供。
5. **盘中数据范围**：MVP 只覆盖"少量盘中关键指标"——具体哪几项？建议 M2 完成后基于 Skill 实际需要回填。
6. **手工边维护工作流**：UI / CSV 导入 / 直接 SQL？M6-T1 之前需要决定形式。
7. **回测子系统时间表**：第二阶段才做，但权重模板初值是否需要先做"快速回测"作为合理性检查？
8. **国际化 / 多用户**：明确不做（requirements §2 / §12.3），但 i18n 键值仍建议从 M5 开始养成习惯。

---

## 九、Review 结论

> 用户在此处填写评审意见；通过后写入"通过"二字 + 日期，本 phase 结束，进入 `2-build-phase.md`。

- [ ] 用户评审通过
- 评审日期：
- 修改意见：

---

## 十、下一步动作（仅在 Review 通过后执行）

1. 创建 `docs/tasks/1-mcp/2-build-phase.md`，从 M0 开始。
2. 在 git 上拉新分支 `feat/m0-baseline`。
3. 按 M0 任务表逐项实施，每完成一项就在本文件勾选。
4. 任一里程碑结束后发起 review，结论回写到本文件 §九。
