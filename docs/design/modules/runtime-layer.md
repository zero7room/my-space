# Runtime Layer · 分析运行时

> 上级文档:[architecture.md](../architecture.md) · 对应 requirements §14.1 / §14.3

## 1. 职责

无业务语义,只提供"调用 LLM、调度 Tool、运行 Skill"的能力。所有上层入口(定时任务、事件触发、自然语言提问)最终都进入此运行时,通过统一契约 `RunRequest` 执行。

## 2. 核心模块

| 模块 | 职责 |
|---|---|
| **LLMGateway** | 多云提供商抽象、统一 messages 接口、function-calling 适配、prompt cache、batch、流式、token / 调用次数追踪,按 `task_kind × latency` 路由 |
| **Tool 注册中心** | 原子能力(取数、算指标、查图、文本抽取),无状态,schema 注册 |
| **Skill 注册中心** | 业务编排单元,有流程,输出标准 Artifact |
| **Skill Executor** | 驱动 Skill 流程的执行器(详见 §4) |
| **会话 / 记忆** | 短期上下文 + 长期通过 Evidence / Artifact 检索 |
| **调用追踪 / 限速器** | Run 级 token / 调用次数上限,防止失控 |

## 3. LLMGateway

**多云提供商**:OpenAI / Anthropic / DeepSeek / 通义 / 智谱。统一 messages 接口屏蔽差异,function-calling 做适配层归一。

**路由策略**:

```
task_kind: extract / summarize / qa / report
  ├─ extract / summarize  → 低价模型(如 Claude Haiku / DeepSeek-V3)
  ├─ qa                   → 中端模型(Sonnet / GPT-4o)
  └─ report               → 高端模型(Opus / GPT-4.1)

全局:
  - prompt cache 默认开启
  - 可批量任务进 batch API
  - Run 级 token / 调用次数上限触发熔断(防失控,非成本预算)
```

**调用追踪**:每次调用记录 `(run_id, provider, model, prompt_tokens, completion_tokens, latency_ms)` 到 `llm_call` 表,供路由优化与故障排查。

## 4. Tool vs Skill 边界

| 维度 | Tool | Skill |
|---|---|---|
| 状态 | 无状态 | 有流程、可多步 |
| 粒度 | 原子(一次取数/一次计算) | 业务结论 |
| 例子 | `get_kline` `calc_rsi` `query_supply_chain` `extract_filing` | `板块龙头识别` `跨市场影响分析` `公告事件解读` |
| 输出 | 原始数据/中间结果 | 标准 Artifact |
| 注册 | schema(input/output JSON Schema) | manifest.yaml(input/output/依赖 Tools/依赖其他 Skill) |

## 5. 统一执行契约

所有入口(Scheduler、策略引擎、Chat、分析页主动触发)都通过同一个契约调用 Runtime:

```python
class RunRequest(BaseModel):
    skill: str
    input: dict           # Skill 声明的 input schema
    context: RunContext   # trigger_source, user_id, parent_run_id, limits
    options: RunOptions   # streaming, batch, dry_run

class RunResult(BaseModel):
    run_id: UUID
    artifact: Artifact
    trace: list[TraceEvent]
    usage: RunUsage       # tokens, tool_calls, latency
```

**Skill Executor 流程**:

```
RunRequest
  → 加载 Skill manifest + 校验 input
  → 初始化 RunContext(挂上 parent,设定 token / 调用次数上限)
  → 执行 Skill 流程(可调 Tool / 调子 Skill / 调 LLM)
  → 收集 trace.jsonl(每步的 input/output/timing)
  → 产出 Artifact(§5 of architecture)
  → 经 Conclusion Sink 把 conclusions[] 落到关系图谱
  → 返回 RunResult
```

**Skill 流程是怎么写的**:第一阶段用 Python 命令式编排(显式调 Tool / LLM),不引入 workflow DSL;LLM 的 function-calling 由 Skill 内部直接驱动,`LLMGateway` 提供 tool-use 适配。复杂多步推理可以由 Skill 内嵌一个小型 ReAct 循环。

## 6. 会话 / 记忆

- **短期**:Chat thread 内的消息历史,按 token 预算滚动压缩。
- **长期**:不存"对话内容",存"对话引用过的 Artifact / Evidence";新会话能 retrieval 历史结论而不是历史措辞。
- **跨会话事实**:用户偏好、关注列表、自定义板块定义,落 `user_profile` 与 `user_watchlist`。

### 6.1 Thread 持久化分工

Chat thread 既要"研究档案"语义(收藏、标签、检索、分享),又要承载流式消息追加,采取"PG 索引 + 文件正文"分层:

| 数据 | 介质 | 表 / 路径 | 用途 |
|---|---|---|---|
| Thread 元信息 | PostgreSQL | `conversation_thread(id, title, subject_ref, tags[], pinned, created_at, last_message_at, archived_at)` | 列表、检索、过滤、置顶 |
| 消息正文 | 文件系统 | `/conversations/{thread_id}/messages.jsonl` | 流式追加、token 预算扫描 |
| 引用索引 | PostgreSQL | `conversation_reference(thread_id, run_id, evidence_id, message_idx)` | "哪些 thread 引用过此 Artifact"反查、保存为策略时溯源 |
| 摘要缓存 | 文件系统 | `/conversations/{thread_id}/summary.json` | 长 thread 的滚动压缩结果 |

Thread 软删除走 `archived_at`;物理清理走每月维护任务,清理 90 天前的 archived thread 与对应文件。

## 7. 调用追踪与限速

- Run 级:`max_tokens` / `max_tool_calls`,任一突破即中断 Run 并标记 `aborted`(防止 LLM 失控调用,非成本控制)。
- 全局熔断:LLM 提供商错误率超阈值时切换到备用 provider。
- 用户提供 API key,Gateway 不做账单/计费,只追踪 token 与调用次数,用于路由优化和故障排查。

### 7.1 凭证加载

- **API key**(LLM provider / Tushare / 飞书 / 电报):统一从 `app/config.py` 读取环境变量(开发支持 `.env`,生产由 systemd / Docker secrets 注入)。
- **多 provider 主备**:每个 provider 至少配主备两套 key(例:`OPENAI_API_KEY` / `OPENAI_API_KEY_BACKUP`),熔断时自动切换。
- **不入库 / 不入日志**:任何 key 不持久化到 PG / 文件;trace 中仅记录 `provider + model_id`,绝不记 key 任何片段。
- **轮换**:用户在 `.env` 中替换并重启服务完成,第一阶段不做热加载。
