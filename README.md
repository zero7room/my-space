# my-space

MCP project workspace.

## Current Baseline

- Planning source: `docs/tasks/1-task/1-plan-phase.md`
- Requirements source: `docs/requirements/1.requirements.md`
- Architecture source: `docs/design/architecture.md`
- ADR index: `docs/decisions/README.md`

## Prerequisites

- Python 3.12 with `uv`
- Node.js 22 with `pnpm`
- Docker Desktop or a compatible Docker daemon

## Local Development

```sh
make dev
```

`make dev` starts the full local Docker Compose stack (`pg`, `redis`, `backend`, `worker`, `web`, `caddy`).

After startup:

- Web via Caddy, preferred for full-stack work: http://localhost
- Web directly: http://localhost:3000
- Key app routes: `/analysis/market`, `/analysis/sector/BK_CPO`, `/analysis/stock/300308`, `/analysis/event/EVT_NVDA_GUIDE`, `/artifacts/run_cpo_leader_20260508`, `/chat/thread_cpo`, `/strategy`, `/strategy/skills`
- Backend health: http://localhost:8000/healthz
- Caddy health proxy: http://localhost/healthz
- Metrics: http://localhost/metrics

For frontend-only work without a backend:

```sh
pnpm --dir web dev:mock
```

`dev:mock` uses a server-side typed fixture for RSC rendering and starts MSW in the browser for client-side requests.

## Local Checks

```sh
make verify
make verify-m0
```

`make verify` is the fast daily suite: docs, backend lint/type/tests, and web lint/type/tests.
`make verify-m0` is the heavier M0 acceptance suite: root/docs, compose config, Alembic upgrade/downgrade, backend verification, OpenAPI export/codegen, web verification, Playwright E2E, and full-stack compose health.

Regenerate the typed frontend client from the backend OpenAPI artifact:

```sh
make backend-openapi
OPENAPI_URL=../backend/openapi.json pnpm --dir web gen:api
```

`backend/openapi.json` is a generated local artifact and is not committed.

## Operations

- Runbook: `docs/RUNBOOK.md`
- Detached deploy: `make deploy`
- Backup: `make backup`

External data and notification integrations are intentionally token-gated. Without `TUSHARE_TOKEN`, LLM provider keys, Feishu webhook, or Telegram token, the app runs with stubs/degradation paths for local verification.

## Completion Scope

`docs/tasks/1-task/3-build-all-phase.md` records the M1-M6 local build ledger. The current repo is a local research-workbench closure: Docker Compose, API contracts, migrations, web routes, mock/stub skill outputs, alert gates, metrics, backup script, and E2E paths are verifiable locally.

Original production/staging acceptance still requires live credentials and environment work: akshare/yfinance/Tushare live collectors, real LLM provider streaming/tool calls, APScheduler/Celery wiring, Feishu/Telegram staging notifications, ECharts/Cytoscape production graph components, HTTPS/Grafana, restore drill, and 7-day operations.
