# ADR-001: Metrics Naming

## Status

Accepted for M0 baseline.

## Context

第一阶段需要先固定少量跨栈可观测性指标，避免后续 backend、worker、scheduler、LLMGateway、collector 与 web-facing API 各自发明 metric 名称和标签。Prometheus 指标需要可聚合、低基数、单位明确，并且能从 M1 到 M6 按 append-only 方式演进。

## Decision

第一阶段先注册以下 4 类核心 metric。所有 counter 指标使用 `_total` 后缀，单位均为 count，标签集必须与本 ADR 一致。

Canonical forms:

- `runs_total{skill,status,trigger}`
- `alerts_total{priority,channel,state}`
- `llm_tokens_total{provider,model,task_kind}`
- `collector_failures_total{source,error_type}`

| Metric | Labels | Unit | Semantics | Cardinality Boundary |
|---|---|---|---|---|
| `runs_total` | `skill`, `status`, `trigger` | count | 记录 Skill / runtime run 的完成、失败或被取消次数；每个 run 在终态时递增一次。 | `skill` 使用注册表中的稳定 skill id；`status` 限定为 `succeeded`、`failed`、`cancelled`、`timeout`；`trigger` 限定为 `manual`、`schedule`、`event`、`api`、`backfill`。 |
| `alerts_total` | `priority`, `channel`, `state` | count | 记录 alert candidate 经过提醒服务后的状态变更结果，用于观察三重闸、合并与发送量。 | `priority` 限定为 `high`、`medium`、`low`；`channel` 限定为 `web`、`feishu`、`telegram`、`daily_digest`；`state` 限定为 `active`、`capped`、`deferred`、`suppressed`、`sent`、`merged`。 |
| `llm_tokens_total` | `provider`, `model`, `task_kind` | tokens | 记录 LLMGateway 上报的 token 使用量，包含 prompt、completion 与 cache 相关 token 的聚合值；token 类型细分如需新增，必须先追加本 ADR。 | `provider` 使用 provider 注册 id；`model` 使用受控配置中的模型名，不允许拼接版本外的请求维度；`task_kind` 限定为 LLMGateway 路由策略中的任务类别。 |
| `collector_failures_total` | `source`, `error_type` | count | 记录 collector 对外部数据源采集失败的次数，用于观察数据源稳定性与降级触发。 | `source` 限定为注册数据源 id，如 `akshare`、`tushare`、`yfinance`、`fred`、`rss`、`pdf`; `error_type` 使用归一化错误类别，如 `timeout`、`rate_limited`、`schema_changed`、`auth_failed`、`parse_failed`、`upstream_error`、`unknown`。 |

## Prohibited High-Cardinality Labels

以下值不得作为 Prometheus label：

- 用户、会话、线程、消息、run、artifact、evidence、alert 的唯一 id。
- 业务主体 id 或代码，如 `subject_id`、`symbol`、`stock_code`、`company_id`、`sector_id`。
- URL、文件路径、PDF hash、exception message、prompt hash、request id。
- 任意自由文本、时间戳、批次号、分页游标、动态参数。

需要排查单个对象时，应使用日志、trace、数据库查询或 artifact，而不是把对象标识放入 metric label。

## Registration Rule

M1-M6 新增 metric 必须先 append 到此 ADR，明确 metric name、labels、unit、semantics 与 cardinality boundary 后，才能注册到 Prometheus。未在本 ADR 登记的 metric 不应出现在 runtime、collector、scheduler、LLMGateway、API 或 web telemetry 配置中。

## Notes

- 指标名使用 snake_case。
- Counter 使用 `_total` 后缀。
- Label 名使用 snake_case，取值来自受控枚举或注册表。
- 单位写入本 ADR；需要 Prometheus help text 时必须与本 ADR 语义一致。
