# Orchestration Layer · 调度与提醒

> 上级文档:[architecture.md](../architecture.md) · 对应 requirements §9 / §14.9 / §14.10

## 1. 职责

- 决定**什么时候**运行哪个 Skill(Scheduler)。
- 决定**什么条件**算"值得提醒"(策略引擎)。
- 决定**怎样推送**给用户、避免疲劳(提醒服务)。

调度层是被动的——它不产生分析,只触发分析,并把分析产物转化为提醒。

## 2. Scheduler

| 触发模式 | 用途 |
|---|---|
| **cron** | 日终任务:财务、板块归属、龙头评分、长期价值 |
| **准实时** | 盘中行情/资金/情绪驱动的轻量任务 |
| **事件触发** | 公告/新闻/政策到达即触发对应 Skill |
| **跨市场时段** | 按美股、商品市场的开盘时间调度 |

技术栈:**APScheduler**(进程内 cron + 事件)+ **Celery**(重任务异步队列)。Scheduler 调用 Runtime 的统一 `RunRequest` 接口,不直接知道 Skill 内部细节。

## 3. 策略引擎

```
RuleParser  →  ExpressionEvaluator  →  VariableResolver
   YAML/JSON     and/or/not/within/changed     metric / relation / event / sector / symbol
```

**输入**:指标流、关系流、事件流、Artifact 流。
**输出**:`AlertCandidate{rule_id, subject, priority, evidence, ctx}`。
**触发源**:调度 tick + 事件到达 + 指标 CDC 变更 + Artifact 命中。

### 3.1 策略类别

- 价格 / 技术(突破、放量、形态)
- 事件 / 公告(关键词、主体、类型)
- 美股/商品/利率联动
- 分析结论变化(Skill Artifact 中的 conclusion 变动)
- 多维组合(YAML DSL)

### 3.2 策略 DSL 示例

```yaml
id: leader_score_change
name: 光模块龙头综合分变动
trigger:
  type: scheduled
  cron: "35 9 * * 1-5"
condition:
  all_of:
    - metric: leader_score.composite
      subject: { type: sector, id: BK_CPO }
      changed_by: ">= 0.05"
      window: "1d"
output:
  priority: high
  message_template: "{subject.name} 综合分变动 {metric.delta:+.2f}"
  open_chat: true
```

### 3.3 NL → DSL

用户在策略页用自然语言描述需求,LLM 转成上述 DSL 并以可视化卡片回填,用户确认或微调后落库。这是策略页的主要创建入口(详见 [client.md](./client.md))。

### 3.4 版本化指标的比较语义

`metric.<id>` 引用版本化指标(典型:`leader_score`,按 `weight_template_version` 多套快照保留)时,DSL 的 `changed`、`changed_by`、`crosses` 等运算遵循以下规则,避免模板切换带来的"伪变动":

- **同版本比较**:`changed` / `changed_by` 默认仅在同一 `weight_template_version` 内的相邻快照之间求差;不同版本快照之间不直接相减。
- **模板切换**:当 `weight_template_version` 发生变更(板块 profile 重打标签 / 模板升级)时,首条新版本快照标记为 `baseline=true`,策略命中被屏蔽一次;后续快照恢复正常比较。
- **跨版本回放**:历史回测场景需要跨版本时,DSL 必须显式声明 `cross_template: true`,否则解析器拒绝执行。
- **审计**:每条 `AlertCandidate` 携带触发依据的 `weight_template_version`,提醒详情页展示该字段,便于追溯。

## 4. 提醒服务

```
AlertCandidate
  → 去重(subject × type,30min 窗)
  → 合并(同主体 1h 内 ≥ N 条 → 摘要包)
  → 优先级 + 静默时段(非交易时段中/低延后到次日开盘前)
  → 每日上限(高 ≤ 20 / 中 ≤ 10 / 低 ≤ 5,超出走日报)
  → Notifier(飞书 / 电报 / 站内 / 主页流)
```

### 4.1 提醒落点(对接 Client)

每条提醒有两个落点:

1. **主页"今日要点"流**:常规落点,所有提醒按时间倒序展示。
2. **铃铛(Notification Bell)**:仅高优先级,跨页面强提示;铃铛点开是历史列表抽屉。

提醒携带的字段:

```jsonc
{
  "alert_id": "uuid",
  "rule_id": "leader_score_change",
  "subject": { "type": "sector", "id": "BK_CPO", "name": "光模块" },
  "priority": "high | medium | low",
  "title": "光模块综合分变动 +0.07",
  "summary": "中际旭创领跑,新易盛风险提示",
  "evidence": ["ev_123", "ev_456"],
  "artifact_run_id": "uuid",          // 关联的完整分析
  "open_chat_thread_id": "uuid?",     // 命中后自动开的 chat thread
  "created_at": "ISO8601"
}
```

### 4.2 自动开 chat thread

策略 DSL 中 `open_chat: true` 时,提醒生成的同时在 Chat 模块自动新建 thread,标题为 `title`,首条消息为 system 推送的 Artifact 卡片。用户点击主页提醒即跳到该 thread,可立即追问。

### 4.3 日报兜底

每日上限触发 + 静默时段降级累积下来的提醒,由日报兜底,避免"超限即丢失":

- **触发时间**:交易日 17:00(沪深收盘后 + 美股盘前缓冲),由 APScheduler cron 触发。
- **来源**:`alert_record` 中当日 `state ∈ {capped, deferred, suppressed}` 的全部记录。
- **内容**:按主体(sector / symbol / event)聚合,每条 1 行摘要 + 计数 + `artifact_run_id` 跳转链接;高/中/低分组;尾部附"未触发但接近阈值"清单(对接客户端"持续观察")。
- **渠道**:飞书 + 电报 + 站内,与高优先级实时提醒分流(独立 webhook),避免 17:00 后误判为新事件。
- **空态**:当日无被压制项时不发,避免噪声。

## 5. 与其他层的协议

- 策略引擎只读 Domain Model + Artifact,不直接访问底层数据。
- 提醒服务只读 Artifact 的 `summary` / `highlights` / `evidence`,不重新计算。
- Scheduler 把 Run 结果回写到 `run` 表,策略引擎订阅 `run` 的 CDC 来检测"分析结论变化"。
