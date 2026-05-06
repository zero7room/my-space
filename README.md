# AI Workflow System V1

Monorepo for the v1 AI Workflow System: confirmed-task workflow with Feishu channel,
SSE visibility, durable filesystem state, retry/recovery, CriticalNodePolicy, skills,
evals, and Agent Teams.

## Layout

- `apps/bot-runtime/` — Node service: API, SSE, ThreadLoop, Executor, Channels.
- `apps/web/` — Next.js client.
- `packages/contracts/` — shared Zod schemas, IDs, state machines, event kinds, API routes.
- `packages/fs-store/` — atomic filesystem primitives, transactions, locks, leases.
- `packages/test-fixtures/` — shared test helpers.

## Commands

```bash
pnpm install
pnpm -r build
pnpm -r test
pnpm lint
```

See `init/requirement.md` and `init/design.md` for product/architecture spec, and
`docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md` for the implementation plan.
