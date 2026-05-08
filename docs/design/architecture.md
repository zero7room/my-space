# 股票分析软件架构设计

> 配套文档:[1.requirements.md](../requirements/1.requirements.md)
>
> 设计目标:在"研究辅助 + 主动提醒"的定位下,构建一个**可解释、可追溯、可演进**的系统架构。所有结论都能展开证据,所有关系都有更新时间和置信度,所有能力都可插拔组合。

> **本文档为总览与索引**。各模块的详细设计在 [`modules/`](./modules/) 目录:
>
> - [Data Layer · 数据采集与存储](./modules/data-layer.md)
> - [Domain Model Layer · 领域模型 + 关系图谱](./modules/domain-model.md)
> - [Runtime Layer · 分析运行时](./modules/runtime-layer.md)
> - [Analysis Layer · 业务分析(Skills)](./modules/analysis-layer.md)
> - [Orchestration Layer · 调度与提醒](./modules/orchestration-layer.md)
> - [Client · 客户端(Web)](./modules/client.md)

---

## 1. 设计原则

1. **证据优先**:任何结论必须可回溯到原始数据;事实 / 统计 / 推断三类关系全程区分。
2. **能力分层**:数据 → 指标 → 关系 → 分析 → 提醒 → 展示,每层契约清晰,跨层只通过模型对象通信。
3. **原子能力 + 策略组合**:底层是无状态 Tool(取数、算指标、查图),上层是有业务语义的 Skill(板块复盘、龙头识别、跨市场传导)。
4. **执行路径单一**:定时任务、事件触发、自然语言提问最终都进入同一个分析运行时(`RunRequest` 契约),避免重复实现。
5. **演进友好**:第一阶段用关系型 + JSON 跑通,再逐步替换为图数据库、向量库、实时流。

---

## 2. 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│  Client Layer  Web 客户端                                          │
│  主页 │ Chat │ 分析(大盘/板块/个股/事件) │ 策略(策略+Skill 库)     │
│  全局:铃铛 / Cmd+K / 提醒中心                                      │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │  统一产物 Artifact(含证据链)
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Analysis Layer  业务分析(Skills)                                 │
│  板块中心 │ 龙头识别器 │ 产业链分析器 │ 跨市场影响引擎 │ 事件解释器 │
│  长期价值评估 │ 热点判断 │ LLM 报告生成                             │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Orchestration Layer  调度与提醒                                   │
│  Scheduler(cron / 事件 / 条件) │ 策略引擎 │ 提醒服务(合并/降级)  │
└──────────────────────────────────────────────────────────────────┘
                              ▲
                              │
┌──────────────────────────────────────────────────────────────────┐
│  Runtime Layer  分析运行时                                         │
│  LLMGateway │ Tool 注册中心 │ Skill 注册中心 │ Skill Executor       │
│  会话/记忆 │ 调用追踪/限速器                                       │
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
│  采集器(A股/美股/商品/利率/公告/新闻) │ 清洗/对齐 │ 持久化(PG+JSON+文件)│
└──────────────────────────────────────────────────────────────────┘
```

---

## 3. 分层概要

每层的详细设计、表结构、Schema 见对应模块文档。下面只做职责摘要。

### 3.1 [Data Layer](./modules/data-layer.md)

负责从异构数据源(akshare / Tushare / yfinance / FRED 等)拉取原始数据,封装为统一的 `RawRecord`。第一阶段用 PostgreSQL(关系型 + JSONB)+ 文件系统三段式存储,Redis 仅作为 Celery broker 和短 TTL 缓存。所有原始记录附 `source_id` 与 `content_hash`,作为 `Evidence` 的根。

### 3.2 [Domain Model Layer](./modules/domain-model.md)

承载领域实体(Stock / Company / Sector / Product / Commodity / MarketVariable / MarketEvent / Evidence)、统一结构的关系边、版本化的指标快照。Sector 走 `canonical / provider / mapping` 三表分离原始来源与对外身份。所有关系边和结论必须带 `relation_class ∈ {fact, statistical, inferred}` 和 `evidence[]`,由 **Conclusion Sink** 统一校验后落库。

### 3.3 [Runtime Layer](./modules/runtime-layer.md)

无业务语义的执行底座。核心是 **LLMGateway**(多云 + 路由 + 调用追踪)和 **Skill Executor**(驱动 Skill 流程、维护 trace)。所有上层入口经统一 `RunRequest` 契约进入,确保定时任务、事件触发、自然语言提问走同一执行路径。

### 3.4 [Analysis Layer](./modules/analysis-layer.md)

业务 Skill 的集合:板块中心、龙头识别器、热点分析器、大盘分析器、产业链分析器、跨市场影响引擎、事件解释器、长期价值评估、LLM 报告生成。每个 Skill 输出标准 Artifact,结论带 `relation_class` 与置信度。Skill 之间可依赖调用(子 Run 挂 `parent_run_id`)。

### 3.5 [Orchestration Layer](./modules/orchestration-layer.md)

Scheduler(APScheduler + Celery)、策略引擎(YAML/JSON DSL,支持 NL → DSL)、提醒服务(去重 / 合并 / 优先级 / 静默时段 / 每日上限)。提醒落点为**主页今日要点流 + 铃铛兜底**,高优先级可自动开启 chat thread。

### 3.6 [Client](./modules/client.md)

四页架构:**主页 / Chat / 分析 / 策略**。

- **主页**:今日要点 + 关注画像(板块/个股迷你卡)+ 持续观察。
- **Chat**:多 thread 研究档案,Artifact 内联富卡片渲染,支持"保存为策略"。
- **分析**:大盘 / 板块 / 个股 / 事件 四段沉浸式 Subject Page。
- **策略**:我的策略(NL → DSL 配置)+ Skill 库。

技术栈:Next.js 16 + React 19 + shadcn/ui + Tailwind v4 + ECharts + Cytoscape.js + TanStack Query + Zustand,REST + OpenAPI 契约。

---

## 4. 关键运行时流程

### 4.1 板块龙头查询(§6.1)

```
用户请求 → 板块中心 Skill
        → Tool: 取板块成员、公司指标
        → 龙头识别器 Skill: 五维评分(板块类型化权重)
        → 证据管理器附加评分依据
        → Conclusion Sink 落 leader_score 历史快照
        → 输出 Artifact → Web 龙头榜
```

### 4.2 龙头上下游展开(§6.2)

```
选定龙头 → 产业链分析器
        → Tool: 查图谱(supplies_to / buys_from / competes_with / depends_on / priced_by)
        → 筛选关键路径(强度+置信度+时效性)
        → 输出 Artifact → 产业链图(分析-个股 tab / Chat 全屏)
```

### 4.3 跨市场影响(§6.3)

```
事件输入 → 事件解释器(识别主体/类型,含 LLM 抽取)
        → 跨市场影响引擎
            ├─ 图谱层:maps_to / influences / depends_on
            ├─ 指标层:历史联动、滞后相关、事件窗口
            └─ 证据层:附来源/置信度/关系类型
        → 输出 Artifact:影响路径 + 受益/承压 + 观察指标
```

### 4.4 提醒生成(§6.4)

```
策略引擎命中 → AlertCandidate
            → 提醒服务(合并/去重/优先级/静默)
            → 落主页今日要点流 + 铃铛(高优先级)
            → 推送(飞书/电报)
            → 若 open_chat: true,自动新建 chat thread 挂载 Artifact
```

### 4.5 自然语言问答

```
用户提问 → Runtime 加载 thread 历史 + 检索相关 Artifact / Evidence
        → LLM 决策:直接回答 / 调 Tool / 调 Skill
        → 调 Skill 时与定时任务同路径(同一 RunRequest)
        → 回复携带 Evidence 引用,前端可展开溯源 / 全屏
```

### 4.6 Chat → Strategy 凝固

```
用户在 chat 中完成一次研究 → 点击"保存为策略"
        → LLM 读取 thread 提问 + Skill 调用,转 DSL 草稿
        → 跳转策略页"新建策略",DSL 预填
        → 用户确认/微调 → 落库启用 → 进入定时调度
```

---

## 5. 统一产物契约(Artifact Schema)

所有 Skill 产物的共同形态,是上层(看板、提醒、对话引用)解耦的关键。

```jsonc
{
  "run_id": "uuid",
  "skill": "leader_identification",
  "created_at": "2026-05-08T15:30:00+08:00",
  "subject": { "type": "sector", "id": "BK_CPO" },
  "summary": "光模块板块龙头排序更新:中际旭创领跑...",
  "highlights": [
    { "level": "info", "text": "中际旭创综合分 0.86,较上期 +0.04" },
    { "level": "warn", "text": "新易盛单一客户依赖度上升,风险提示" }
  ],
  "conclusions": [
    {
      "claim": "中际旭创为光模块板块龙头一",
      "relation_class": "statistical",
      "confidence": 0.82,
      "evidence": ["ev_123", "ev_456"]
    }
  ],
  "data": { /* 评分拆解、指标快照、明细 */ },
  "charts": [
    { "type": "bar", "title": "五维评分", "series": [/*...*/] }
  ],
  "references": ["run_id_x"],
  "raw_pointer": "/runs/2026-05-08/leader_identification/{run_id}/raw/"
}
```

下游约定:

- 提醒服务只读 `summary` + `highlights`。
- 主页/看板只读 `data` + `charts` + `summary`。
- 对话引用 `conclusions` 与 `evidence`,可点开 `raw_pointer` 深挖。
- Conclusion Sink 读 `conclusions`,经校验后落到关系图谱(`edge` 表)。

**字段边界**(关键):

- `conclusions[]` = **结构化结论**,经 Conclusion Sink 校验后落 `edge` / `leader_score` / `impact_score` 等结果表;每条必须带 `relation_class + confidence + evidence[]`。例:"中际旭创为光模块龙头一" 是 conclusion。
- `data` = **展示用明细**,只入文件 / 看板缓存,不入图谱。例:五维评分子分数、成员排名、明细列表。
- 同一字段允许在两处出现(如龙头综合分:`conclusions` 中作为 `LeaderScore` 落库;`data` 中作为前端渲染数据),但 Sink 只读 `conclusions`,不会重复落库。
- 默认五维子分进入 `data`;若需要某子分单独形成结论(如"盈利质量极差"作为风险边),由 Skill 在 `conclusions[]` 显式构造。

---

## 6. 存储目录组织(持久化布局)

```
/runs/{date}/{skill}/{run_id}/
    input.json          ← 触发参数
    trace.jsonl         ← LLM/Tool 调用链
    artifact.json       ← 标准产物
    raw/                ← 原始数据快照

/symbols/{code}/
    timeline.jsonl      ← 个股事件流(跨 Skill 聚合)
    latest.json         ← 最新结论快照

/sectors/{sector_id}/
    latest.json         ← 板块最新画像(成员/龙头/热度)
    history.jsonl       ← 历史摘要

/skills/{skill}/latest.json    ← 看板默认数据源

/conversations/{thread_id}/
    messages.jsonl
    references.json     ← 引用过的 run_id / evidence_id
```

关系型库(PostgreSQL)承载:实体、指标、关系边、提醒记录、用户配置、策略 DSL。文件系统承载:原始件、Run 留痕、看板缓存。

---

## 7. 可插拔扩展点

| 扩展点 | 注册方式 | 典型场景 |
|---|---|---|
| 新数据源 | 实现 Collector 接口 + 映射规则 | 新接入一家行情商 |
| 新 Tool | 实现 Tool 接口 + JSON Schema 注册 | 新增一个产业链查询接口 |
| 新 Skill | manifest.yaml(输入/输出/依赖 Tools)+ 编排实现 | 新增一类分析报告 |
| 新策略 | DSL(YAML/JSON)注册到策略引擎 | 多维组合提醒 |
| 新通道 | 实现 Notifier 接口 | 增加邮件 / 钉钉 |
| 新视图 | 看板组件注册 + 对接 Artifact | 增加新型图表 |

---

## 8. 数据质量与风险控制(架构级)

对应 requirements §10,落到架构层面的强约束:

- **关系类型字段强制**:所有 `Edge` / `Conclusion` 必须有 `relation_class`,缺失即拒绝入库。
- **Evidence 强制**:重要结论无 evidence 不出库;由 **Conclusion Sink** 统一校验。
- **过期降权**:超出 `expires_hint` 的关系/结论由策略引擎自动降权或屏蔽。
- **置信度门槛**:低置信度结论在前端必须打标,不进入提醒高优先级。
- **LLM 输出隔离**:LLM 直接产出永远落 `inferred`,需经规则或人工提升才能改判。
- **限速兜底**:Run 级 token / 调用次数上限,避免 LLM 失控调用。

---

## 9. 演进路线(与 requirements §12/§13 对齐)

**第一阶段**:

- 数据层:日终 + 少量盘中关键指标。
- 领域模型 + PostgreSQL(关系型 + JSON 字段)模拟图谱。
- Runtime + 核心 Tool 集 + Skill Executor。
- Skills:板块中心、龙头识别、长期价值、大盘/热点看板、公告摘要、轻量 NL 问答。
- Scheduler + 策略引擎(规则驱动 + NL → DSL)+ 提醒服务。
- Web 四页(主页 / Chat / 分析 / 策略)+ 飞书/电报机器人。
- requirements §12.2 美股 → A 股映射高价值传导路径手工维护。

**第二阶段**:

- LLM 自动抽取公告/财报,扩充图谱。
- 板块影响图谱完善、事件驱动分析、历史回测验证。
- 多维组合策略 DSL。
- Chat 与 Strategy 深度打通(保存为策略全流程)。

**第三阶段**:

- 关系迁移图数据库;文本入向量库。
- 实时预警与盘中策略。
- NL 问答深度集成 + 自动研究报告。
- 用户自定义板块、权重、关系。
- 目标驱动 Agent(用户设目标,AI 自主决定监控逻辑)。

---

## 10. 与 requirements 关键决议的对应关系

requirements §14 / §15 的 16 项决议与本文档的对应章节:

| requirements 决议 | 架构落点 | 状态 |
|---|---|---|
| §14.1 服务端技术栈(Python · FastAPI · APScheduler · Celery) | [runtime-layer](./modules/runtime-layer.md) · [orchestration-layer](./modules/orchestration-layer.md) | ✅ |
| §14.2 存储(PG + JSONB + 文件) | [data-layer](./modules/data-layer.md) · §6 目录 | ✅ |
| §14.3 LLM 接入(多云 + LLMGateway) | [runtime-layer](./modules/runtime-layer.md) | ✅ |
| §14.4 数据源(akshare/Tushare/yfinance/FRED) | [data-layer](./modules/data-layer.md) | ✅ |
| §14.5 板块(多源 + canonical 三表) | [domain-model](./modules/domain-model.md) | ✅ |
| §14.6 Evidence 全字段 schema | [domain-model](./modules/domain-model.md) | ✅ |
| §14.7 抽取分工 | [analysis-layer](./modules/analysis-layer.md) | ✅ |
| §14.8 龙头评分模板化 | [analysis-layer](./modules/analysis-layer.md) | ✅ |
| §14.9 策略 DSL(YAML/JSON)+ NL→DSL | [orchestration-layer](./modules/orchestration-layer.md) | ✅ |
| §14.10 提醒疲劳三重闸 | [orchestration-layer](./modules/orchestration-layer.md) | ✅ |
| §15.1 Next.js 16 RSC | [client](./modules/client.md) | ✅ |
| §15.2 shadcn/ui + Tailwind | [client](./modules/client.md) | ✅ |
| §15.3 ECharts + Cytoscape.js | [client](./modules/client.md) | ✅ |
| §15.4 REST + OpenAPI | [client](./modules/client.md) | ✅ |
| §15.5 TanStack Query + Zustand | [client](./modules/client.md) | ✅ |
| §15.6 工程化(pnpm/ESLint/Vitest/Playwright) | [client](./modules/client.md) | ✅ |

**新增产品形态决议**(2026-05-08):

| 决议 | 落点 | 状态 |
|---|---|---|
| 四页导航(主页 / Chat / 分析 / 策略) | [client.md](./modules/client.md#2-顶部导航) | ✅ |
| 分析页四段(大盘 / 板块 / 个股 / 事件) | [client.md](./modules/client.md#5-分析--analysis) | ✅ |
| 主页混合布局(今日要点 + 关注画像 + 持续观察) | [client.md](./modules/client.md#3-主页--home) | ✅ |
| 提醒落点(主页流 + 铃铛兜底) | [client.md](./modules/client.md#71-铃铛-notification-bell) · [orchestration-layer.md](./modules/orchestration-layer.md#41-提醒落点对接-client) | ✅ |
| 策略页两 tab(我的策略 / Skill 库) | [client.md](./modules/client.md#6-策略--strategy) | ✅ |
| Agent 第一阶段规则驱动 + NL 转规则 | [client.md](./modules/client.md#63-agent-形态第一阶段) · [orchestration-layer.md](./modules/orchestration-layer.md#33-nl--dsl) | ✅ |

---

## 11. 测试与验证策略

测试金字塔(对应 plan-phase 各里程碑的 `pytest` / `vitest` / `playwright`):

| 层 | 范围 | 工具 | 覆盖目标 |
|---|---|---|---|
| 单元 | Repository / Sink / DSL evaluator / 单 Skill 纯函数路径 | `pytest` + Hypothesis | 行覆盖 ≥ 80%;关键约束(Sink 拒绝路径、DSL 跨版本语义、阈值边界)100% |
| 集成 | Skill ↔ Tool ↔ DB ↔ LLMGateway 端到端;Collector ↔ akshare 用 cassette | `pytest` + testcontainers + VCR.py | 每个核心 Skill 至少 1 条 happy + 1 条降级路径(数据缺失 / source `degraded`) |
| LLM 回归 | LLM 抽取 / 报告类 Skill 的 golden fixtures(`tests/llm_fixtures/*`) | `pytest` + 抽样人工抽检 | 换 prompt / 换模型必跑;变化项归因后才合并 |
| E2E | Web 主路径(板块查询 / 龙头展开 / 跨市场分析 / 提醒中心 / Chat 保存策略) | Playwright | M5 出口 5 条核心路径,CI 全绿 |

**关键不变量必须有专门用例**:Conclusion Sink 拒绝缺 evidence / 缺 `relation_class`;策略 DSL 在 `weight_template_version` 切换时不误报;提醒服务三重闸边界;数据源降级矩阵 6 类失败形态;`sector_membership` 阈值上下界。

LLM 调用在测试默认走 `mock provider`(返回固定 fixture);在线模型回归由独立工作流触发,不进入 PR CI。

---

具体实施分阶段任务见 `docs/tasks/1-task/1-plan-phase.md`。
