# AI Workflow System V1

> AI 员工自动工作流系统，v1 — 确认式任务执行、SSE 可视化、飞书通道、重试恢复、Agent Teams。

## Quick Start (5 分钟上手)

```bash
git clone <repo> my-space && cd my-space
cp .env.example .env              # 默认即可离线跑（LLM_PROVIDER=heuristic）
pnpm install && pnpm -w build
docker compose -f tooling/docker-compose.local.yml up -d
open http://localhost:3000        # 打开 Workbench
```

### First prompt

进入 Workbench 后，点击左侧 `+ 新对话`，输入例如：

> 试试发送：`帮我分析 data/sample.csv 并生成一个 Markdown 报告`

AI 员工会先给出计划草稿 → 你确认 → 进入运行态 → 右侧抽屉实时显示 Plan/日志/产物。

### Working locally without any LLM API key

`.env.example` 的默认 `LLM_PROVIDER=heuristic` 会启用本地 `HeuristicLlmGuard`：
无需任何外部模型密钥即可完成意图判定、计划确认、工具调用的完整流程，适合首次体验、
离线开发、CI。配置 `LLM_PROVIDER=anthropic` 或 `openai` 并填入 `LLM_API_KEY` 后，
系统会自动切换到真实模型。

## Layout

- `apps/bot-runtime/` — Node 服务：API、SSE、ThreadLoop、Executor、Channels。
- `apps/web/` — Next.js 客户端 Workbench。
- `packages/contracts/` — 共享 Zod schema、IDs、状态机、事件 kind、API 路由。
- `packages/fs-store/` — 原子文件系统原语：事务、锁、租约。
- `packages/test-fixtures/` — 共享测试工具。

## Commands

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm lint
```

## Env var quick reference

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `LLM_PROVIDER` | LLM 适配器：`heuristic` / `anthropic` / `openai` | `heuristic` |
| `LLM_API_KEY` | 真实模型 API Key，仅 `anthropic` / `openai` 时需要 | （空） |
| `LOCAL_USER_TOKENS` | 本地 `userId:token` 映射 | `usr_dev…:dev-token` |
| `NEXT_PUBLIC_BEARER` | Web 客户端默认 token | `dev-token` |
| `NEXT_PUBLIC_RUNTIME_URL` | Web → Runtime 地址 | `http://localhost:4000` |
| `RUNTIME_ID` | 运行时实例 ID，决定 `data/instances/<id>/` 路径 | `local-dev` |

完整列表见 `.env.example`。

## Docs

- 运维与故障排查：`docs/runbooks/`
- 实施计划、评审记录与演进过程：`docs/superpowers/plans/`
- 需求与架构：`init/requirement.md` · `init/design.md`
- 本次实施主干：`docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`
