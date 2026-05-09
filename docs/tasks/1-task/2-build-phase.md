# Task 1 · MCP · Build Phase

> 本文件承接 [`1-plan-phase.md`](./1-plan-phase.md)。当前 build 从 M0 工程基线开始。

---

## 一、目标

执行 plan-phase 中 M0 工程基线任务，建立可继续扩展的后端、前端、工程化、ADR 与本地运行骨架。

---

## 二、Agent Team

| Agent | 职责 | 状态 |
|---|---|---|
| Franklin | `backend/**` 后端 FastAPI / Alembic / 测试骨架 | DONE：后端骨架、Alembic、测试与 OpenAPI 导出已通过本机验证 |
| Aristotle | `web/**` Next.js / React / Tailwind / MSW / Vitest / Playwright | DONE：前端 lint/type/test/e2e 通过 |
| Laplace | `docs/decisions/**` 与根工程文件初稿 | DONE：ADR、根工程文件、compose 与 hooks 已补齐并通过验收 |
| James | M0 批判视角只读审查 | DONE：指出 CI、pre-commit、server-side mock、文档回写等问题，已处理 |
| Schrodinger | M0 验收缺口复审 | DONE：指出 compose healthcheck、Alembic 升降级、readyz DB、codegen 与 pre-commit 缺口，已处理 |
| Russell | 产品视角复审 | DONE：指出 README、mock 语义、API base、首页模块边界问题，已处理 |

---

## 三、M0 实施结果

| 任务 | 结果 | 证据 |
|---|---|---|
| M0-T1 | ✅ 完成 | `backend/app/{api,domain,data,runtime,orchestration,skills,llm}` 已创建；`uv run python -c "import app"` 通过；`make backend-verify` 通过 |
| M0-T2 | ✅ 完成 | `backend/app/main.py`、`/healthz`、`/readyz`、RFC 7807 problem JSON handler 已实现；`/readyz` 会执行 DB 探针；`curl localhost:8000/readyz` 返回 `{"status":"ready"}` |
| M0-T3 | ✅ 完成 | `backend/alembic/env.py`、`backend/alembic/versions/0001_init.py` 已创建；`make verify-migrations` 完成 upgrade → downgrade → upgrade |
| M0-T4 | ✅ 完成 | `.pre-commit-config.yaml` 覆盖 ruff lint、ruff format、mypy、pytest、web lint/type/test、conventional commit；`make verify-pre-commit` 通过；bad message 被拒 |
| M0-T5 | ✅ 完成 | `docker compose up -d --build` 可拉起 `pg`、`redis`、`backend`、`worker`、`web`、`caddy`；所有容器 healthy；`curl localhost/healthz` 200 |
| M0-T6 | ✅ 完成 | `web/` Next.js 16 + React 19 + Tailwind v4 初始化；根路由渲染工作台与 Button |
| M0-T7 | ✅ 完成 | `backend/scripts/export_openapi.py` 导出 `backend/openapi.json`；`OPENAPI_URL=../backend/openapi.json pnpm gen:api` 同步 `web/lib/api/schema.ts`；`web-codegen-check` 纳入 `make verify-m0` |
| M0-T8 | ✅ 完成 | ESLint flat、Prettier、Vitest、Playwright 已配置；前端验证通过 |
| M0-T8b | ✅ 完成 | MSW browser handlers 与服务端 mock 分支共用 OpenAPI 类型约束 fixture；`pnpm dev:mock` 可在后端缺位时返回 mock ping |
| M0-T9 | ✅ 完成 | `docs/decisions/README.md` 已创建并索引 ADR |
| M0-T9b | ✅ 完成 | `docs/decisions/ADR-001-metrics-naming.md` 已创建，包含四类核心 metric 与禁止高基数标签 |

---

## 四、验证记录

| 命令 | 结果 | 备注 |
|---|---|---|
| `make verify-docs verify-root` | ✅ 通过 | ADR、根工程文件存在性检查通过 |
| `docker compose config --quiet` | ✅ 通过 | Compose 配置可解析 |
| `make backend-verify` | ✅ 通过 | ruff lint、ruff format、mypy、pytest 6 个测试通过 |
| `make backend-openapi` | ✅ 通过 | 导出 `backend/openapi.json` 作为本地生成产物 |
| `make verify-migrations` | ✅ 通过 | PostgreSQL 上完成 Alembic upgrade → downgrade → upgrade |
| `OPENAPI_URL=../backend/openapi.json pnpm gen:api`（`web/`） | ✅ 通过 | `web/lib/api/schema.ts` 与后端 OpenAPI 同步 |
| `pnpm --filter @my-space/web lint` | ✅ 通过 | 前端 lint 通过 |
| `pnpm --filter @my-space/web typecheck` | ✅ 通过 | 前端 TypeScript 通过 |
| `pnpm --filter @my-space/web test` | ✅ 通过 | Vitest 1 个测试通过 |
| `pnpm test:e2e`（`web/`） | ✅ 通过 | Playwright Chromium 1 个测试通过 |
| `pnpm dev:mock` + `curl http://localhost:3000` | ✅ 通过 | 首页服务端渲染显示 typed server fixture；浏览器侧 MSW 也会启动 |
| `python3 scripts/check_conventional_commit.py` | ✅ 通过 | bad message 被拒；`feat(m0): add baseline` 被接受 |
| `make verify-pre-commit` | ✅ 通过 | 通过 `uvx pre-commit run --all-files` 执行全部 pre-commit hooks |
| `docker compose up -d --build` | ✅ 通过 | 完整栈构建并启动；`docker compose ps` 显示 6 个服务 healthy |
| `curl http://localhost/healthz` / `curl http://localhost/readyz` / `curl http://localhost/api/v1/ping` | ✅ 通过 | Caddy 反代后分别返回 `ok`、`ready`、`pong` |
| `curl http://localhost` | ✅ 通过 | 首页显示 `研究辅助工作台`、`今日要点`、`关注画像`、`持续观察`、`ready` / `api` / `pong` |
| `make verify-m0` | ✅ 通过 | M0 出口验收套件：root/docs、compose config、migration、backend、OpenAPI codegen、web、E2E |

---

## 五、M0 Review 结论

### 批判审查发现与处置

| # | 问题 | 处置 |
|---|---|---|
| R-M0-01 | 缺 CI workflow | 已新增 `.github/workflows/ci.yml`，覆盖 docs/root、backend、OpenAPI codegen、web、E2E |
| R-M0-02 | pre-commit 缺 ruff format 与 conventional commit | 已新增 `backend-format` hook 与 `scripts/check_conventional_commit.py` commit-msg hook |
| R-M0-03 | M0 文件未纳入 git 跟踪 | 已统一 stage；生成物边界检查未发现缓存 / build 产物误入 |
| R-M0-04 | 文档状态未回写 | 已新增本 build phase，并回写 plan-phase 终审通过与 M0 勾选 |
| R-M0-05 | `dev:mock` 不能拦截 RSC server fetch | 已新增服务端 mock 分支与共享 typed fixture |
| R-M0-06 | `pnpm gen:api` 依赖运行中后端 | 已支持本地 OpenAPI 文件输入；CI 通过 `backend/scripts/export_openapi.py` 生成 |
| R-M0-07 | `make verify` 未覆盖 E2E / compose | 已新增 `verify-e2e` 与 `verify-compose`；`make verify` 保持快速本地验证，M0 review 单独记录 E2E / compose |
| R-M0-08 | compose 字面上无法满足“所有容器健康” | 已给 `worker`、`web`、`caddy` 补 healthcheck；`backend` healthcheck 改打 `/readyz` |
| R-M0-09 | `/readyz` 静态返回，掩盖 DB 不可用 | 已改为执行 `SELECT 1`；DB 不可用时返回 RFC 7807 风格 503 |
| R-M0-10 | Alembic 升降级未纳入验收 | 已新增 `verify-migrations` 并纳入 `verify-m0` 与 CI |
| R-M0-11 | `NEXT_PUBLIC_API_BASE_URL` 暴露 compose 内部 hostname | 已拆分 `API_BASE_URL`（Next server 内网）与 `NEXT_PUBLIC_API_BASE_URL`（浏览器同源） |
| R-M0-12 | 首页静态预渲染会固化 build-time API fallback | 已设置 `dynamic = "force-dynamic"`，容器运行时能读取真实后端 |
| R-M0-13 | web Docker build context 过大 | 已新增 `web/.dockerignore`，构建上下文从 600MB+ 降至 KB 级 |
| R-M0-14 | CI 运行 migration 但没有 PostgreSQL service | 已在 GitHub Actions 加 `postgres:16-alpine` service，并给 `verify-migrations` 注入 `DATABASE_URL` |
| R-M0-15 | `verify-m0` 未自动复验完整 compose health | 已新增 `verify-stack`，纳入 `verify-m0`，执行 `docker compose up -d --build` 并 curl Caddy health/ready/ping |
| R-M0-16 | `verify-pre-commit` 未覆盖 commit-msg stage | 已在 `verify-pre-commit` 中加入 good/bad commit message 脚本化验证 |
| R-M0-17 | browser mock 依赖 server API client 模块 | 已拆分 `browser-config.ts` / `server-config.ts`，浏览器 mock bundle 只读 public/same-origin base |
| R-M0-18 | `localhost:3000` 直连时同源 `/api` 无后端代理 | 已在 Next config 增加 `/api/:path*` rewrite 到 `API_BASE_URL`，与 Caddy 入口语义一致 |

### 产品视角 Review

- 当前首屏不是营销页，直接呈现研究辅助工作台、提醒入口、今日观察与接口探针，符合“自用研究辅助 + 主动提醒”的产品定位。
- M0 页面按 M5a 首页方向预埋了“今日要点 / 关注画像 / 持续观察”三块轻量结构，但不提前实现 M5 图表或复杂交互。
- `dev:mock` 的语义已拆清：RSC 使用 typed server fixture，浏览器侧启动 MSW；接口探针在真实 compose 下显示 `ready` / `api` / `pong`。
- README 记录了依赖、访问地址、mock 模式、OpenAPI codegen 与 `make verify` / `make verify-m0` 的分层边界。

### 遗留风险

1. `backend/openapi.json` 是本地生成产物，已加入 `.gitignore`；提交边界以 `web/lib/api/schema.ts` 的 codegen diff 为准。
2. CI 真实执行需依赖 GitHub Actions 环境；本地已用等价命令和 compose 完整栈完成验证。

---

## 六、下一步

1. 可提交 M0 工程基线，或进入 M1。
2. 进入 M1 时先执行 `M1-T0 数据源 Spike`，不得直接写 schema migration。
