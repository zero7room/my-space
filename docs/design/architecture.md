# 股票分析软件架构设计

> 配套文档：[requirements.md](./requirements.md)
>
> 设计目标：在"研究辅助 + 主动提醒"的定位下，构建一个**可解释、可追溯、可演进**的系统架构。所有结论都能展开证据，所有关系都有更新时间和置信度，所有能力都可插拔组合。

---

## 1. 设计原则

1. **证据优先**：任何结论必须可回溯到原始数据；事实 / 统计 / 推断三类关系全程区分。
2. **能力分层**：数据 → 指标 → 关系 → 分析 → 提醒 → 展示，每层契约清晰，跨层只通过模型对象通信。
3. **原子能力 + 策略组合**：底层是无状态 Tool（取数、算指标、查图），上层是有业务语义的 Skill（板块复盘、龙头识别、跨市场传导）。
4. **执行路径单一**：定时任务、事件触发、自然语言提问最终都进入同一个分析运行时，避免重复实现。
5. **演进友好**：MVP 用关系型 + JSON 跑通，再逐步替换为图数据库、向量库、实时流。

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Interaction Layer  展示与交互                                     │
│  Web 看板 │ 飞书/电报机器人 │ 站内通知 │ 自然语言问答入口             │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  统一产物 Artifact（含证据链）
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Analysis Layer  业务分析（Skills）                                │
│  板块中心 │ 龙头识别器 │ 产业链分析器 │ 跨市场影响引擎 │ 事件解释器 │
│  长期价值评估 │ 热点判断 │ LLM 报告生成                              │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Orchestration Layer  调度与提醒                                   │
│  Scheduler（cron / 事件 / 条件） │ 策略引擎 │ 提醒服务（合并/降级/优先级）│
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Runtime Layer  分析运行时                                         │
│  LLM 引擎 │ Tool 注册中心 │ Skill 注册中心 │ 会话/记忆               │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Domain Model Layer  领域模型 + 关系图谱                           │
│  Stock │ Company │ Sector │ Product │ Commodity │ MarketVariable  │
│  MarketEvent │ Evidence │ Metrics │ Edges(supplies/influences/...)│
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Data Layer  数据采集与存储                                        │
│  采集器（A股/美股/商品/利率/公告/新闻） │ 清洗/对齐 │ 持久化(关系型+JSON+文件)│
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. 分层详解

### 3.1 Data Layer（数据采集与存储）

**采集器（Collectors）**（对应 requirements §14.4）：每个数据源一个采集器，统一输出 `RawRecord`（含来源、采集时间、原始字段、原始内容指纹）。

| 数据域 | 主源 | 补充源 | 内容 |
|---|---|---|---|
| A 股行情/资金/板块/龙虎榜/公告 | `akshare` | — | 日线 / 分钟、北向、主力、概念/行业、龙虎榜 |
| A 股财务（部分字段） | `akshare` | `Tushare`（按需开启） | 三表数据、估值、股东 |
| 美股股价 / 财报 | `yfinance` | — | 日线、关键财务 |
| 美债利率 / 通胀 | `FRED API` | — | DGS10、CPI、PMI |
| 商品 / 汇率 | `akshare` | — | 原油、铜、黄金、美元、人民币 |
| 文本源 | `akshare`（公告 PDF）/ 自有 RSS | — | 公告、研报、新闻 |

**存储分工（MVP，对应 requirements §14.2）**：

| 类型 | 介质 | 用途 |
|---|---|---|
| 关系型 | PostgreSQL | 实体、指标、关系边、提醒记录、策略配置 |
| 文档 | PostgreSQL JSONB 字段 | 证据列表、Skill Artifact、规则 DSL、Evidence.extra |
| 文件系统 | `data/raw/`、`data/runs/` | 原始 PDF/HTML、Run 留痕、看板缓存 |

**清洗与对齐**：

- 同一公司多地上市统一到 `Company`；板块体系按 §3.2 的 canonical 映射对齐。
- 时间戳统一到 `Asia/Shanghai`，按交易日（含调休）规整。
- 所有原始记录附 `source_id`，作为 `Evidence` 的根。

**演进**：第二阶段评估 Redis 缓存盘中热点；第三阶段图谱迁图数据库、文本入向量库（pgvector → 专用库）。

### 3.2 Domain Model Layer（领域模型 + 图谱）

完全对应 requirements §5。所有上层只读领域模型，不直接读底层表。

**核心实体**：`Stock`、`Company`、`SectorCanonical`、`SectorProvider`、`SectorMapping`、`SectorMembership`、`Product`、`Commodity`、`MarketVariable`、`MarketEvent`、`Evidence`。

**Sector 三表**（对应 requirements §14.5）：

| 表 | 角色 | 关键字段 |
|---|---|---|
| `sector_canonical` | 对外唯一身份；Skill / 看板只读此表 | `id`、`name`、`type(industry/concept/index/region/theme)`、`profile(cycle/tech/consumer/financial)` |
| `sector_provider` | 三方/交易所/自建来源原始板块 | `id`、`provider`（eastmoney / ths / sse / szse / manual）、`provider_code`、`provider_name` |
| `sector_mapping` | provider → canonical 多对多映射 | `provider_sector_id`、`canonical_sector_id`、`relevance`(0-1)、`as_of`、`evidence` |

`SectorMembership(stock, sector_canonical, relevance, confidence, as_of)`：弱相关概念板块需通过 `relevance × confidence ≥ 阈值` 才能进入龙头候选。

**关系边（统一结构）**：

```jsonc
{
  "type": "supplies_to | buys_from | competes_with | substitutes |
           depends_on | priced_by | influences | maps_to | same_theme |
           belongs_to_sector",
  "from": "<entity_id>",
  "to": "<entity_id>",
  "direction": "positive | negative | nonlinear | uncertain",
  "strength": 0.0,           // 0~1
  "confidence": 0.0,         // 0~1
  "relation_class": "fact | statistical | inferred",
  "evidence": ["<evidence_id>", ...],
  "updated_at": "ISO8601",
  "expires_hint": "ISO8601?" // 过期降权
}
```

**指标**：`FinancialMetric`、`MarketMetric`、`SectorMetric`、`LeaderScore`、`ImpactScore`，统一带 `as_of` 与 `source`。

**Evidence Schema**（对应 requirements §14.6，已敲定）：

```sql
CREATE TABLE evidence (
  id           UUID PRIMARY KEY,
  type         TEXT NOT NULL,  -- announcement|filing|news|research|stat|llm|manual
  source       TEXT NOT NULL,
  url_or_path  TEXT,
  title        TEXT,
  excerpt      TEXT,           -- 200 字以内摘录
  observed_at  TIMESTAMPTZ NOT NULL,
  hash         TEXT NOT NULL,
  lang         TEXT,           -- zh / en
  extra        JSONB NOT NULL DEFAULT '{}'  -- 类型相关子字段
);
CREATE INDEX evidence_hash_idx ON evidence(hash);
CREATE INDEX evidence_type_observed_idx ON evidence(type, observed_at DESC);
```

`extra` 按 `type` 携带子字段：
- `stat`：`{metric_id, window_start, window_end, sample_size}`。
- `llm`：`{model, prompt_hash, temperature, output_kind}`。

**强约束**（DB 级 + 业务校验）：缺 evidence、缺 `relation_class`、缺 `observed_at` 的关系或结论一律拒绝入库（出库前 schema 校验，参见 §8）。

### 3.3 Runtime Layer（分析运行时）

无业务语义，只提供"调用 LLM、调度 Tool、运行 Skill"的能力。

| 模块 | 职责 |
|---|---|
| **LLMGateway** | 多云提供商抽象（OpenAI / Anthropic / DeepSeek / 通义 / 智谱）、统一 messages 接口、function-calling 适配、prompt cache、batch、流式、token / 成本计费、按 `task_kind × latency × cost` 路由 |
| Tool 注册中心 | 原子能力（取数、算指标、查图、文本抽取），无状态，schema 注册 |
| Skill 注册中心 | 业务编排单元，有流程，输出标准 Artifact |
| 会话 / 记忆 | 短期上下文 + 长期通过 Evidence / Artifact 检索 |

**LLMGateway 路由**（对应 requirements §14.3）：

```
task_kind: extract / summarize / qa / report
  ├─ extract / summarize  → 低价模型（如 Claude Haiku / DeepSeek-V3）
  ├─ qa                   → 中端模型（Sonnet / GPT-4o）
  └─ report               → 高端模型（Opus / GPT-4.1）
全局：开 prompt cache；可批量任务进 batch API；Run 级 token / 调用 / 成本上限触发熔断。
```

**Tool vs Skill 边界**：

| 维度 | Tool | Skill |
|---|---|---|
| 状态 | 无状态 | 有流程、可多步 |
| 粒度 | 原子（一次取数/一次计算） | 业务结论 |
| 例子 | `get_kline` `calc_rsi` `query_supply_chain` `extract_filing` | `板块龙头识别` `跨市场影响分析` `公告事件解读` |

### 3.4 Analysis Layer（业务分析 / Skills）

每个分析器都是一个 Skill，对应 requirements §4 的多维分析能力：

- **板块中心**：板块查询、成员、涨跌、资金、估值、热度。
- **龙头识别器**：按 §4.2 五维评分，按 `sector_canonical.profile` 加载四套权重模板（cycle / tech / consumer / financial，对应 requirements §14.8）；输出前三 + 评分拆解快照（写入 `leader_score`）+ 风险。
- **热点分析器**：当日聚焦、持续性判断（一日游/轮动/主线）、传导路径。
- **大盘分析器**：指数 + 宽度 + 资金 + 情绪。
- **产业链分析器**：以龙头为中心展开上下游、竞品、原材料、客户、关键事件。
- **跨市场影响引擎**：美股 / 商品 / 利率 → A 股传导，输出"关键风险路径"。
- **事件解释器**：抽取分工遵循 requirements §14.7 ——结构化数字走规则 Tool；公告/新闻文本走 LLMGateway 的 `extract_filing` Tool 落 `inferred` evidence；§12.2 高价值产业链边由人工录入并标 `fact`。
- **长期价值评估**：基本面 + 估值分位 + 治理风险。
- **LLM 报告生成**：综合上述产物输出板块/个股/事件研究报告。

> 每个 Skill 输出统一 Artifact（§5），并在结论上标注 `relation_class`（事实/统计/推断）与置信度。

### 3.5 Orchestration Layer（调度与提醒）

**Scheduler**：

- cron：日终（财务、板块归属、龙头评分、长期价值）。
- 准实时：盘中行情/资金/情绪驱动的轻量任务。
- 事件触发：公告/新闻/政策到达即触发对应 Skill。
- 跨市场时段：按美股、商品市场的开盘时间调度。

**策略引擎**（对应 requirements §9.2 / §14.9）：

```
RuleParser  →  ExpressionEvaluator  →  VariableResolver
   YAML/JSON     and/or/not/within/changed     metric / relation / event / sector / symbol
```

- 输入：指标流、关系流、事件流。
- 输出：`AlertCandidate{rule_id, subject, priority, evidence, ctx}`。
- 触发源：调度 tick + 事件到达 + 指标 CDC 变更。
- 策略类别：价格 / 技术、事件 / 公告、美股联动、分析结论变化、多维组合（YAML DSL，参见 requirements §14.9 示例）。

**提醒服务**（对应 §9.3 / §14.10）：

```
AlertCandidate
  → 去重（subject × type，30min 窗）
  → 合并（同主体 1h 内 ≥ N 条 → 摘要包）
  → 优先级 + 静默时段（非交易时段中/低延后到次日开盘前）
  → 每日上限（高 ≤ 20 / 中 ≤ 10 / 低 ≤ 5，超出走日报）
  → Notifier (飞书 / 电报 / 站内)
```

每条提醒携带：触发原因、关键证据、相关板块/个股、下一步观察指标、置信度、`relation_class`。

### 3.6 Interaction Layer（展示与交互）

**Web 客户端**（对应 requirements §15）：

| 维度 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19，默认 RSC |
| UI | shadcn/ui + Tailwind v4 |
| 表格 / 趋势 | ECharts |
| 产业链图 / 跨市场影响图 | Cytoscape.js |
| 服务端状态 | TanStack Query |
| UI 状态 | Zustand |
| 前后端契约 | REST + OpenAPI 自动生成 TS 客户端 |
| 工程化 | pnpm + ESLint flat + Prettier + Vitest + Playwright |

**核心视图**：板块总览表、龙头榜、产业链图、跨市场影响图。
**辅助视图**：热点看板、大盘看板、提醒中心（历史 + 上下文 + 后续走势回看）、自然语言问答入口。

**机器人**：飞书 / 电报，仅承载提醒推送与轻量问答。

---

## 4. 关键运行时流程

### 4.1 板块龙头查询（§6.1）
```
用户请求 → 板块中心 Skill
        → Tool: 取板块成员、公司指标
        → 龙头识别器 Skill: 五维评分（板块类型化权重）
        → 证据管理器附加评分依据
        → 输出 Artifact → Web 龙头榜
```

### 4.2 龙头上下游展开（§6.2）
```
选定龙头 → 产业链分析器
        → Tool: 查图谱（supplies_to / buys_from / competes_with / depends_on / priced_by）
        → 筛选关键路径（强度+置信度+时效性）
        → 输出 Artifact → 产业链图
```

### 4.3 跨市场影响（§6.3）
```
事件输入 → 事件解释器（识别主体/类型，含 LLM 抽取）
        → 跨市场影响引擎
            ├─ 图谱层：maps_to / influences / depends_on
            ├─ 指标层：历史联动、滞后相关、事件窗口
            └─ 证据层：附来源/置信度/关系类型
        → 输出 Artifact：影响路径 + 受益/承压 + 观察指标
```

### 4.4 提醒生成（§6.4）
```
策略引擎命中 → 提醒服务
            → 合并/去重/优先级评估
            → 推送（飞书/电报 + 站内）
            → 写入提醒中心，挂上下文与后续追踪任务
```

### 4.5 自然语言问答
```
用户提问 → Runtime 加载 Memory + 检索相关 Artifact / Evidence
        → LLM 决策：直接回答 / 调 Tool / 调 Skill
        → 调 Skill 时与定时同路径
        → 回复携带 Evidence 引用，前端可展开溯源
```

---

## 5. 统一产物契约（Artifact Schema）

所有 Skill 产物的共同形态，是上层（看板、提醒、对话引用）解耦的关键。

```jsonc
{
  "run_id": "uuid",
  "skill": "leader_identification",
  "created_at": "2026-05-08T15:30:00+08:00",
  "subject": { "type": "sector", "id": "BK_CPO" },
  "summary": "光模块板块龙头排序更新：中际旭创领跑...",
  "highlights": [
    { "level": "info", "text": "中际旭创综合分 0.86，较上期 +0.04" },
    { "level": "warn", "text": "新易盛单一客户依赖度上升，风险提示" }
  ],
  "conclusions": [                       // 结构化结论
    {
      "claim": "中际旭创为光模块板块龙头一",
      "relation_class": "statistical",
      "confidence": 0.82,
      "evidence": ["ev_123", "ev_456"]
    }
  ],
  "data": { /* 评分拆解、指标快照、明细 */ },
  "charts": [
    { "type": "bar", "title": "五维评分", "series": [...] }
  ],
  "references": ["run_id_x"],
  "raw_pointer": "/runs/2026-05-08/leader_identification/{run_id}/raw/"
}
```

下游约定：

- 提醒服务只读 `summary` + `highlights`。
- 看板只读 `data` + `charts`。
- 对话引用 `conclusions` 与 `evidence`，可点开 `raw_pointer` 深挖。

---

## 6. 存储目录组织（持久化布局）

```
/runs/{date}/{skill}/{run_id}/
    input.json          ← 触发参数
    trace.jsonl         ← LLM/Tool 调用链
    artifact.json       ← 标准产物
    raw/                ← 原始数据快照

/symbols/{code}/
    timeline.jsonl      ← 个股事件流（跨 Skill 聚合）
    latest.json         ← 最新结论快照

/sectors/{sector_id}/
    latest.json         ← 板块最新画像（成员/龙头/热度）
    history.jsonl       ← 历史摘要

/skills/{skill}/latest.json    ← 看板默认数据源

/conversations/{conv_id}/
    messages.jsonl
    references.json     ← 引用过的 run_id / evidence_id
```

关系型库（PostgreSQL）承载：实体、指标、关系边、提醒记录、用户配置。文件系统承载：原始件、Run 留痕、看板缓存。

---

## 7. 可插拔扩展点

| 扩展点 | 注册方式 | 典型场景 |
|---|---|---|
| 新数据源 | 实现 Collector 接口 + 映射规则 | 新接入一家行情商 |
| 新 Tool | 实现 Tool 接口 + schema 注册 | 新增一个产业链查询接口 |
| 新 Skill | manifest.yaml（输入/输出/依赖 Tools）+ 编排实现 | 新增一类分析报告 |
| 新策略 | 策略 DSL（YAML/JSON）注册到策略引擎 | 多维组合提醒 |
| 新通道 | 实现 Notifier 接口 | 增加邮件 / 钉钉 |
| 新视图 | 看板组件注册 + 对接 Artifact | 增加新型图表 |

---

## 8. 数据质量与风险控制（架构级）

对应 requirements §10，落到架构层面的强约束：

- **关系类型字段强制**：所有 `Edge` / `Conclusion` 必须有 `relation_class` ∈ {fact, statistical, inferred}，缺失即拒绝入库。
- **Evidence 强制**：重要结论无 evidence 不出库（出库前 schema 校验）。
- **过期降权**：关系/结论超出 `expires_hint` 后由策略引擎自动降权或屏蔽。
- **置信度门槛**：低置信度结论在前端必须打标，不进入提醒高优先级。
- **LLM 输出隔离**：LLM 直接产出永远落到 `inferred`，需经规则或人工提升才能改判。
- **预算与限速**：Run 级 token / 调用 / 成本上限，避免 LLM 失控。

---

## 9. 演进路线（与 requirements §12/§13 对齐）

**MVP（第一阶段）**：
- 数据层：日终 + 少量盘中关键指标。
- 领域模型 + PostgreSQL（关系型 + JSON 字段）模拟图谱。
- Runtime + 核心 Tool 集。
- Skills：板块中心、龙头识别、长期价值、大盘/热点看板、公告摘要、轻量 NL 问答。
- Scheduler + 飞书/电报机器人 + 站内通知。
- Web 四类核心视图 + 提醒中心。
- §12.2 美股 → A 股映射高价值传导路径手工维护。

**第二阶段**：
- LLM 自动抽取公告/财报，扩充图谱。
- 板块影响图谱完善、事件驱动分析、历史回测验证。
- 多维组合策略 DSL。

**第三阶段**：
- 关系迁移图数据库；文本入向量库。
- 实时预警与盘中策略。
- NL 问答深度集成 + 自动研究报告。
- 用户自定义板块、权重、关系。

---

## 10. 与 requirements 关键决议的对应关系

requirements §14 / §15 的 16 项决议与本文档的对应章节：

| requirements 决议 | 架构落点 | 状态 |
|---|---|---|
| §14.1 服务端技术栈（Python · FastAPI · APScheduler · Celery） | §3.3、§3.5 | ✅ 已落 |
| §14.2 存储（PG + JSONB + 文件） | §3.1 存储分工表、§6 目录 | ✅ 已落 |
| §14.3 LLM 接入（多云 + LLMGateway） | §3.3 新增 LLMGateway 模块 | ✅ 已落 |
| §14.4 数据源（akshare/Tushare/yfinance/FRED） | §3.1 Collector 列表 | ✅ 已落 |
| §14.5 板块（多源 + canonical 三表） | §3.2 Sector 三表 | ✅ 已落 |
| §14.6 Evidence 全字段 schema | §3.2 Evidence Schema | ✅ 已落 |
| §14.7 抽取分工 | §3.4 事件解释器 + §3.5 文本到达触发 | ✅ 已落 |
| §14.8 龙头评分模板化 | §3.4 Leader Identifier 输入 | ✅ 已落 |
| §14.9 策略 DSL（YAML/JSON） | §3.5 RuleParser/Evaluator/Resolver | ✅ 已落 |
| §14.10 提醒疲劳三重闸 | §3.5 提醒服务 | ✅ 已落 |
| §15.1 Next.js 16 RSC | §3.6 Web 客户端 | ✅ 已落 |
| §15.2 shadcn/ui + Tailwind | §3.6 Web 客户端 | ✅ 已落 |
| §15.3 ECharts + Cytoscape.js | §3.6 Web 客户端 | ✅ 已落 |
| §15.4 REST + OpenAPI | §3.6 Web 客户端 | ✅ 已落 |
| §15.5 TanStack Query + Zustand | §3.6 Web 客户端 | ✅ 已落 |
| §15.6 工程化（pnpm/ESLint/Vitest/Playwright） | §3.6 Web 客户端 | ✅ 已落 |

具体实施分阶段任务见 `docs/tasks/1-mcp/1-plan-phase.md`。
