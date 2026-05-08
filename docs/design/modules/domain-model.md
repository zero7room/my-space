# Domain Model Layer · 领域模型 + 关系图谱

> 上级文档:[architecture.md](../architecture.md) · 对应 requirements §5 / §14.5 / §14.6

## 1. 职责

- 为上层提供"业务语义"的数据视图——上层只读领域对象,不直接读底层表。
- 承载实体、关系边、指标、证据,以及它们之间的引用完整性。
- 强制证据链规范:任何关系或结论必须可回溯。

## 2. 核心实体

`Stock` / `Company` / `SectorCanonical` / `SectorProvider` / `SectorMapping` / `SectorMembership` / `Product` / `Commodity` / `MarketVariable` / `MarketEvent` / `Evidence`。

### 2.1 Sector 三表

板块语义来自多个来源(东财/同花顺/交易所/自建),需要做"原始 → 规范"的两层结构。

| 表 | 角色 | 关键字段 |
|---|---|---|
| `sector_canonical` | 对外唯一身份;Skill / 看板只读此表 | `id`、`name`、`type(industry/concept/index/region/theme)`、`profile(cycle/tech/consumer/financial)` |
| `sector_provider` | 三方/交易所/自建来源原始板块 | `id`、`provider`(eastmoney / ths / sse / szse / manual)、`provider_code`、`provider_name` |
| `sector_mapping` | provider → canonical 多对多映射 | `provider_sector_id`、`canonical_sector_id`、`relevance`(0-1)、`as_of`、`evidence` |

`SectorMembership(stock, sector_canonical, relevance, confidence, as_of)`:弱相关概念板块需通过 `relevance × confidence ≥ 阈值` 才能进入龙头候选(第一阶段阈值 0.5,单源默认 `confidence=0.8` × `relevance=0.7` = 0.56)。

**`canonical_sector.id` 命名规则**:`<前缀>_<代码>`。前缀:`BK`(行业 / 概念 / 指数)、`RG`(地域)、`TH`(主题 / 事件驱动)。代码部分使用大写英文缩写或拼音首字母,稳定不复用——例:`BK_CPO`(光模块)、`BK_LIBATT`(锂电池)、`BK_AICHIP`(AI 芯片)、`TH_2026H1`(2026 半年报季)。

### 2.2 关系边(统一结构)

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

**写入路径**:Skill 输出的 Artifact 中包含 `conclusions[]`,由"结论入库器"(Conclusion Sink)统一校验后落到 `edge` 表;Skill 不直接写图谱。校验规则见 §5。

### 2.3 指标

`FinancialMetric` / `MarketMetric` / `SectorMetric` / `LeaderScore` / `ImpactScore`,统一带 `as_of` 与 `source`。涉及金额的指标(市值、营收、净利润、成交额、自由现金流等)必带 `currency ∈ {CNY, USD, HKD}`;跨市场聚合或同板块成员对比前由领域服务统一换算到 `CNY`,换算汇率作为 `Evidence.extra.fx_rate` 留痕,`as_of` 取换算时刻。

**版本化**:`LeaderScore` 等评分类指标按 `(subject, score_type, weight_template_version, as_of)` 唯一,**保留所有历史快照**。这样:
- 板块权重模板升级、成员变动、算法迭代都能被审计。
- 主页"持续观察"和分析页的"评分趋势"都基于历史快照。
- 提醒中的"中际旭创综合分变动 +0.07"能精确指向变动前后的两个快照。

## 3. Evidence Schema

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

`extra` 按 `type` 携带子字段:

- `stat`:`{metric_id, window_start, window_end, sample_size}`。
- `llm`:`{model, prompt_hash, temperature, output_kind}`。

## 4. 模型对象 vs 持久化

上层(Skill / 看板 / API)只感知 Pydantic 模型对象,不感知 SQL/JSONB 细节:

```
Service Layer (FastAPI handler)
       ↓
Repository (SQLAlchemy / asyncpg)
       ↓
PostgreSQL (实体表 + JSONB 字段)
```

模型对象的 `from_orm` / `to_orm` 转换集中在 Repository 层,Skill 只 import `domain.models`。

## 5. 强约束(DB 级 + 业务校验)

- **关系类型字段强制**:所有 `Edge` / `Conclusion` 必须有 `relation_class ∈ {fact, statistical, inferred}`,缺失即拒绝入库。
- **Evidence 强制**:关系边或结论无 `evidence[]` 时拒绝入库。
- **过期降权**:超出 `expires_hint` 的关系/结论由策略引擎自动降权或屏蔽(不直接删除,保留历史)。
- **置信度门槛**:低置信度结论在前端必须打标,不进入提醒高优先级。
- **LLM 输出隔离**:LLM 直接产出永远落 `inferred`;需经规则或人工 review 才能提升为 `statistical` 或 `fact`。

校验执行点:**Conclusion Sink** + **DB CHECK 约束**双层。Sink 在 Repository 层,所有写入路径必经此处。

## 6. Conclusion Sink 实现形态

Sink 是一个 **Python 服务函数**(`app.domain.conclusion_sink.sink_conclusions`),不是 DB trigger。所有 Skill 输出 Artifact 后,Skill Executor 同步调用 `sink_conclusions(run_id, conclusions[])`,在同一事务内完成校验 + 落 `edge` / `leader_score` / `impact_score` 等结果表。

**为什么不在 DB 层做**:

- 校验涉及"evidence 记录是否存在 + 内容指纹一致"这种跨表约束,trigger 写起来反人类。
- LLM 输出的提升降级(`inferred → statistical`)需要业务规则参与,Python 层更合适。
- 错误返回需要带结构化 reason,便于在 trace 中调试。

**接口契约**:

```python
class SinkResult(BaseModel):
    accepted: list[ConclusionRef]    # (edge_id 或 score_id)
    rejected: list[RejectedConclusion]  # 含 reason: enum(missing_evidence, missing_relation_class,
                                        #                 unknown_subject, version_mismatch, ...)

def sink_conclusions(run_id: UUID, conclusions: list[Conclusion]) -> SinkResult: ...
```

- **拒绝行为**:不抛异常、不污染事务,把拒绝项回写到 `run.trace`,由 Skill 决定是否回退。
- **回退路径**:错误结论已落库时,通过 `revoke_conclusion(edge_id, reason, evidence_id)` 软删除——置 `revoked_at`、保留历史快照,不物理删除。
- **DB 兜底**:`edge` / `leader_score` 表上仍保留 `relation_class NOT NULL` 等 CHECK 约束,作为绕过 Sink 的最后一道防线。
