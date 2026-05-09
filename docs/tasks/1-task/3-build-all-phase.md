# Task 1 · MCP · Full Build Phase

> 本文件承接 [`1-plan-phase.md`](./1-plan-phase.md) 与 [`2-build-phase.md`](./2-build-phase.md)。当前目标是从 M1 继续执行到 M6，并在每个阶段结束后做批判视角 review。

---

## 一、执行原则

- M1 必须先完成 `M1-T0 数据源 Spike`，再进入 schema migration。
- 每个阶段完成后：运行阶段验证、清理阶段 Agent、做只读批判 review、修复 review 问题、再进入下一阶段。
- 外部 token / webhook 缺失的验收用 stub/mock 先闭环，并在本文件记录真实联调缺口。
- 最终阶段完成后做产品视角 review、修复问题、运行全量测试。

---

## 二、Agent Team

| Agent | 职责 | 状态 |
|---|---|---|
| Aquinas | M1 Data / Domain / Alembic / Collector / Evidence / Conclusion Sink | DONE：交付 M1 schema/domain/seed/spike；阶段后已关闭 |
| Noether | M2-M4 API / Skill / LLMGateway / DSL / Alerts | DONE：交付后端 contract/mock skill/gateway/alert 骨架；阶段后已关闭 |
| Dewey | M5a-M5b Web / Product / E2E | DONE：交付 Web 路由与 E2E；阶段后已关闭 |
| Rawls | Docs / Acceptance matrix / stale-state review | DONE：指出 M0 旧状态，已修复 |
| Kierkegaard | M1 只读批判审查 | DONE：指出 Spike、PG/ORM 类型、Repository、Conclusion Sink、seed 覆盖缺口；已修复高风险项并记录真实 collector 缺口 |
| Carson | M2-M4 只读批判审查 | DONE：指出 `alert_record`、schema 字段、LLMGateway trace/cache、scheduler/notifier stub 缺口；已修复本地可验证高风险项 |
| Descartes | M5 产品/Web 只读批判审查 | DONE：指出页面直读 fixtures、未知 id 回退、提醒中心交互缺口；已由 Hegel 修复关键项 |
| Hegel | M5 Web 修复 worker | DONE：统一 API helper、未知 id empty state、提醒过滤/已读/收藏、E2E 补充；阶段后已关闭 |

---

## 三、阶段状态

| 阶段 | 状态 | 备注 |
|---|---|---|
| M0 | ✅ 完成 | 见 `2-build-phase.md` |
| M1 | ✅ 本地闭环完成 / ⏳ 真实采集未验收 | Alembic M1 schema、Repository、Evidence、Conclusion Sink、collector 降级契约、CSV manual edge seed；真实 akshare/yfinance/Tushare collector 仍依赖 SDK/token 与 live mapper |
| M2 | ✅ Contract/mock skill 完成 / ⏳ 日终产物未验收 | Pydantic schema、OpenAPI、tool registry、核心 Artifact mock；真实日终 skill 计算与 `/skills/<skill>/latest.json` 输出仍待真实数据源/runner |
| M3 | ✅ Stub 闭环完成 / ⏳ 真实 LLM 未验收 | LLMGateway provider stubs、路由、cache token 折减、limit trace、`extract_filing` keyword/golden smoke；真实 provider/function-call/tool-call/streaming 待 API key |
| M4 | ✅ 本地闭环完成 / ⏳ 调度通知未验收 | `alert_record` migration/model、DSL baseline semantics、AlertGate 三重闸、DB model 转换、alerts/strategies API；真实 APScheduler/Celery 与 Feishu/Telegram staging 联调未完成 |
| M5a | ✅ 本地闭环完成 / ⏳ 专用图表库未接入 | 看板路由、主页、分析页、Artifact、提醒中心过滤/已读/收藏、统一 API helper；图表为轻量 SVG/HTML 替代，未接入 ECharts/Cytoscape.js 生产组件 |
| M5b | ✅ 本地闭环完成 / ⏳ 真实对话闭环未验收 | Chat/strategy routes、mock streaming、Chat→Strategy 路径、Cmd+K、铃铛、Playwright 路径；真实 SSE/PG thread/messages.jsonl 持久化/NL→DSL 落库仍待后端 API |
| M6 | ✅ 本地运维闭环完成 / ⏳ 生产运维未验收 | `/metrics`、`docs/RUNBOOK.md`、`scripts/backup.sh`、`make deploy`/`make backup`、OpenAPI/codegen/compose 验证；HTTPS/Grafana/restore drill/7 天运维待上线环境 |

---

## 四、验证记录

| 命令 | 结果 | 备注 |
|---|---|---|
| `make verify-m0` | ✅ 通过 | M0 基线复验；完整 compose health 通过 |
| `make verify-pre-commit` | ✅ 通过 | 含 commit-msg good/bad 验证 |
| `make backend-verify` | ✅ 通过 | ruff、format、mypy、pytest；以最新运行输出为准 |
| `make verify-migrations` | ✅ 通过 | PostgreSQL upgrade head → downgrade base → upgrade head；head `0003_m4_alert_record` |
| `make backend-openapi` | ✅ 通过 | 重新导出 `backend/openapi.json` |
| `OPENAPI_URL=../backend/openapi.json pnpm gen:api` | ✅ 通过 | `web/lib/api/schema.ts` 已同步 |
| `make web-verify` | ✅ 通过 | Web lint/typecheck/Vitest；以最新运行输出为准 |
| `make verify-e2e` | ✅ 通过 | Playwright Chromium；以最新运行输出为准 |
| `cd backend && uv run alembic upgrade head --sql` | ✅ 通过 | offline SQL 覆盖 `0001`→`0002`→`0003` |

---

## 五、批判 Review 处置记录

| 来源 | 问题 | 处置 |
|---|---|---|
| M1 review | Alembic UUID/ARRAY 与 ORM String/JSON 不一致，SQLite 测不出 PG 风险 | 已统一迁移为 `String(36)` + JSONB list，`verify-migrations` 真实跑 PostgreSQL |
| M1 review | Repository 只有 Stock 可 upsert，非 stock `attach_evidence` 会失败 | 已补 Company/Product/Commodity/MarketVariable/MarketEvent upsert 与 `EvidenceLink` fallback |
| M1 review | Conclusion Sink 只认识 stock，leader/impact 不校验 unknown subject | 已扩展 subject 校验到 stock/company/product/commodity/market_variable/market_event/sector，并覆盖测试 |
| M1 review | 手工边未覆盖费半指数、美债利率，且不是 CSV 输入 | 已扩展默认 seed 到 NVDA/TSLA/AAPL/SOX/DGS10 传导路径，新增 CSV loader 与测试 |
| M1 review | Collector 只有文档，没有代码级降级契约 | 已新增 `app.data.collectors`，覆盖 Tushare token missing、SDK missing、FRED schema drift/timeout、announcement dir |
| M2-M4 review | M4 `alert_record` 缺 schema，AlertStore 只在内存 | 已新增 `0003_m4_alert_record`、ORM model、Pydantic record → DB model 转换 |
| M2-M4 review | API schema 缺 `as_of`/`metric_coverage`/alert channels/sent_at/parent | 已补 Pydantic schema、contract route 和 API contract tests |
| M2-M4 review | LLM cache/limit trace 不满足验收 | 已补 cache hit token 折减和 limit trace event |
| M5 review | 页面直读 fixtures，真实 API 接入不可证明 | 已新增 `web/lib/app/api.ts`，主要页面经 API helper；mock/fallback 明确分层 |
| M5 review | 未知 id 回退第一条 fixture，产品上误导 | 已改为 empty/error state，并补 E2E |
| M5 review | 提醒中心只有展示壳 | 已补优先级过滤、已读/未读、收藏交互 |
| Final product review | 首页入口不完整，用户容易误以为只有首页 | 已补工作流地图、策略/Skill/Chat 直接入口、顶部快捷入口 |
| Final product review | 后端 `{items: [...]}` 合约导致生产 SSR 崩溃 | 已补 API response normalizers 与 Vitest 覆盖 |
| Final product review | 图谱/证据交互过静态 | 已补节点/边 evidence 展开与 Artifact evidence 链接；专用 ECharts/Cytoscape 仍列为真实验收缺口 |
| Final docs review | 原计划真实验收与本地闭环口径混淆 | 已把阶段状态拆为本地闭环与外部真实验收缺口 |

---

## 六、产品视角 Review 结论

- 第一屏现在是可用工作台，不是营销页；可从首页进入板块、个股、事件、Artifact、Chat、策略和 Skill 库，也有“工作流地图”串起提醒 → 分析 → Artifact → Chat → 策略。
- `localhost:3000` 直连也通过 Next rewrite/API helper 工作；Caddy 入口仍推荐使用 `http://localhost`。
- 对用户容易误判的地方已修复：未知板块不会显示第一条 fixture；提醒状态与后端枚举对齐；页面数据入口统一，后续接真实 API 不需要重写页面。
- 当前仍是“本地研究工作台闭环”，不是完整生产联调：真实行情/LLM/通知/HTTPS/Grafana/restore drill 需 token 与 staging/生产环境。

---

## 七、外部依赖缺口

| 事项 | 当前处理 |
|---|---|
| akshare / yfinance SDK | collector lazy import + dependency-missing degradation 已测试；真实采集需安装 SDK 并补 live mapper |
| Tushare token | `TUSHARE_TOKEN` 为空时跳过已测试；真实补采需 token |
| FRED / 外网稳定性 | FRED CSV schema/timeout 契约已测试；真实长期稳定性需运行观察 |
| LLM provider keys | provider stub、本地 cache/limit trace 已闭环；真实多云、function-call、streaming 需 API key |
| 飞书 / Telegram token | Notifier stub 先闭环；真实 staging 待 webhook/token 与失败重试 |
| ECharts / Cytoscape.js | 当前用轻量 SVG/HTML 图表满足本地交互；真实大规模图谱和 ECharts 雷达图需接入专用库 |
| Scheduler / Celery | 当前 worker 为 placeholder；真实定时与重任务调度待 APScheduler/Celery wiring |
| SSE / 消息持久化 | 当前 Chat 为 mock streaming；真实 SSE、PG thread 索引与 `messages.jsonl` 待实现 |
| 生产 HTTPS / Grafana / restore drill | 本地 compose/Caddy 闭环；真实域名证书、Grafana 仪表盘、备份恢复演练和 7 天运维待上线环境 |
