# Data Layer · 数据采集与存储

> 上级文档:[architecture.md](../architecture.md) · 对应 requirements §14.2 / §14.4

## 1. 职责

- 对外:从异构数据源拉取原始数据,统一封装成 `RawRecord`。
- 对内:为 Domain Model Layer 提供"已对齐、已落库"的原始数据,并保留可追溯的原始件副本。
- 不做业务计算,不做关系判断;只负责"拿到、对齐、落地"。

## 2. 采集器(Collectors)

每个数据源对应一个 Collector,统一接口、统一输出。

| 数据域 | 主源 | 补充源 | 内容 |
|---|---|---|---|
| A 股行情/资金/板块/龙虎榜/公告 | `akshare` | — | 日线 / 分钟、北向、主力、概念/行业、龙虎榜 |
| A 股财务(部分字段) | `akshare` | `Tushare`(按需开启) | 三表数据、估值、股东 |
| 美股股价 / 财报 | `yfinance` | — | 日线、关键财务 |
| 美债利率 / 通胀 | `FRED API` | — | DGS10、CPI、PMI |
| 商品 / 汇率 | `akshare` | — | 原油、铜、黄金、美元、人民币 |
| 文本源 | `akshare`(公告 PDF)/ 自有 RSS | — | 公告、研报、新闻 |

**RawRecord 结构**:

```jsonc
{
  "source_id": "akshare:stock_zh_a_hist",
  "fetched_at": "2026-05-08T15:30:00+08:00",
  "subject": { "type": "stock", "id": "600519.SH" },
  "payload": { /* 原始字段,不做归一 */ },
  "raw_pointer": "/data/raw/2026-05-08/akshare/...",
  "content_hash": "sha256:..."
}
```

## 3. 存储分工(第一阶段)

| 类型 | 介质 | 用途 |
|---|---|---|
| 关系型 | PostgreSQL | 实体、指标、关系边、提醒记录、策略配置 |
| 文档 | PostgreSQL JSONB 字段 | 证据列表、Skill Artifact、规则 DSL、`Evidence.extra` |
| 文件系统 | `data/raw/`、`data/runs/` | 原始 PDF/HTML、Run 留痕、看板缓存 |
| 临时队列 / 缓存 | Redis | Celery broker、任务状态、短 TTL 盘中缓存；不作为真相源 |

**为什么第一阶段用 PG JSONB 而不是图数据库**:多跳关系查询需求在第一阶段不深(主要是 1-2 跳),JSONB + 关系表 + 递归 CTE 足够用;延迟图数据库可以避免过早引入运维复杂度。**边界**:当产业链分析的多跳查询(龙头 → 上游 → 上游原材料 → 该原材料定价货币)成为主流场景时,迁图数据库。

## 4. 数据源 Spike

正式实现 Collector 前先做可用性验证,输出 `docs/tasks/1-task/data-source-spike.md` 记录结果:

| 验证项 | 最低通过标准 |
|---|---|
| A 股日线 / 分钟行情 | 能拉取 5 只样本股票 1 年日线和 1 个交易日分钟数据 |
| A 股板块与成员 | 能拉取行业 / 概念板块及成员,并保留 provider code |
| A 股财务字段 | 能覆盖龙头评分一级字段的核心财务指标;缺失字段列出补源 |
| 公告 PDF / 文本 | 能下载至少 2 家样本公司的公告并生成 `Evidence` 根记录 |
| 美股行情 / 财报 | 能拉取 NVDA、TSLA、AAPL 一年日线和最近财报摘要 |
| FRED 指标 | 能拉取 DGS10 与 CPIAUCSL,并写入 `market_variable` |

Spike 不产出业务结论,只验证接口、字段、频率、限流和失败形态。

## 5. 清洗与对齐

- **公司归一**:多地上市统一到 `Company`(沪/港/美 同一发行人)。
- **板块对齐**:provider sector → canonical sector 通过 `sector_mapping` 表(详见 [domain-model.md](./domain-model.md))。
- **时区**:数据库存储统一 UTC(`TIMESTAMPTZ`),展示层按 `Asia/Shanghai` 转换;美股 / FRED 等异市场数据源原始时间戳在 `RawRecord.payload.source_ts` 保留来源时区,便于盘前 / 盘后语义还原。
- **交易日历**:A 股以 akshare `tool_trade_date_hist_sina_em` 为单一真相源(含调休);美股交易日另设 `nyse_calendar`(由 yfinance 间接拉取);两个日历落 `trading_calendar` 表,由 collector 每月刷新;Spike 期间各拉一年验证调休完整性。
- **来源指纹**:每条 `RawRecord` 附 `source_id` 和 `content_hash`,作为 `Evidence` 的根。
- **去重**:同一 `(source_id, subject, observed_at)` 命中已有 `content_hash` 时跳过。

## 6. 演进路径

- **第二阶段**:Redis 缓存盘中热点(分钟级行情、资金流)。
- **第三阶段**:关系/图谱迁图数据库;文本入向量库(pgvector → 专用库)。
- **第三阶段+**:实时流(Kafka/Pulsar)替代当前的轮询 + 事件触发。

## 7. 关键约束

- 任何采集失败必须写入 `collector_run` 表,带异常类型和上次成功时间;调度层据此判断是否重试或降级。
- 所有 Collector 实现幂等;重复触发不污染数据。
- 原始件保留至少 90 天(法务/审计/回溯需要)。

## 8. 数据源失败降级矩阵

第三方源(尤其 akshare)接口变更、限流、临时不可用是常态,设计层面必须有显式降级策略,避免静默错误污染下游。

| 失败形态 | 检测方式 | 处理 | 下游影响 |
|---|---|---|---|
| **短时不可用 / 超时** | 单次请求异常 | 退避重试(3 次,指数 backoff);仍失败则用上一次成功的 `latest` 快照 | 指标 `as_of` 不更新;Skill 读到旧值,Artifact 标记 `data_freshness=stale` |
| **限流 / 频次限制** | 429 / 站方提示 | 入 Celery 延迟队列,按数据源限速窗错峰重跑 | 任务延迟,但不丢数据 |
| **长时不可用(> 1 个交易日)** | `collector_run` 连续 N 次失败 | 该 source 标记 `degraded`;Skill 输出降低 `confidence`、风险提示置顶 | 提醒服务对依赖该 source 的策略统一降权 |
| **字段消失 / 改名** | 字段映射器抛 `SchemaDriftError` | 自动切到补源(如 akshare → Tushare);无补源则该字段标记 `unavailable` | 龙头评分中该字段进入"维度内重加权"路径(见 analysis-layer §3.1) |
| **字段语义变化(口径漂移)** | Spike 期间留 schema 校验单测,定期跑 | 人工介入,落入 `docs/decisions/` ADR | 结论冻结,等校准 |
| **被封 IP / 账号失效** | 持续 401/403 | 触发高优先级运维提醒;源 `disabled` | 同"长时不可用" |

**统一原则**:

- 不静默用 0 / 默认值替代缺失字段;`null` 一路传到 Skill,由 `metric_coverage` 体现。
- 任何降级路径都要写入 `Evidence.extra.degradation`,Artifact 必须可溯源。
- 数据源 Spike(见 §4)必须覆盖每条降级路径的"实际触发形态"(限流如何返回、字段缺失如何表现),否则补救逻辑只是猜测。
