# Runbook

## Start

```sh
make dev
```

Primary access is through Caddy at `http://localhost`. Direct web access is `http://localhost:3000`; backend health is `http://localhost:8000/healthz`.

## Verify

```sh
make verify
make verify-migrations
make verify-e2e
```

`make verify-m0` runs the heavier compose health suite.

## Verification Matrix

| Area | Local status | Production/staging status |
|---|---|---|
| Compose stack | `make verify-stack` builds and health-checks pg/redis/backend/worker/web/caddy | Production profile, domain, TLS certs not yet exercised |
| API contracts | OpenAPI export/codegen and backend tests cover current contracts | External consumers not yet certified |
| Data collectors | Missing-token/SDK degradation paths covered | Live akshare/yfinance/Tushare/FRED runs need credentials/network observation |
| LLM | Gateway stub, cache, limits, trace covered | Real provider keys, tool-call and streaming behavior not yet exercised |
| Alerts | AlertGate and in-app alert API covered | Feishu/Telegram staging sends and retry behavior not yet exercised |
| Chat | Frontend mock streaming and Chat-to-Strategy navigation covered | FastAPI SSE, PG thread index, `messages.jsonl` persistence not yet exercised |
| Metrics | `/metrics` exposes ADR core metrics | Grafana dashboard not yet rendered in staging |
| Backup | `scripts/backup.sh` creates local backup artifacts | Restore drill must be run manually for a dated backup |

## Back Up

```sh
scripts/backup.sh
```

Backups are written under `data/backups/<utc-timestamp>/` and include `postgres.sql` plus `raw.tgz`.

## Restore Drill

```sh
createdb my_space_restore
psql postgresql://postgres:postgres@localhost:5432/my_space_restore < data/backups/<timestamp>/postgres.sql
mkdir -p data/raw-restore
tar -xzf data/backups/<timestamp>/raw.tgz -C data/raw-restore
```

Record the backup timestamp, restore database name, command output, and any errors in the deployment notes before marking restore verified.

## Tokens

Set runtime credentials through environment variables or `.env`; never commit secrets.

- `TUSHARE_TOKEN`
- LLM provider API keys
- Feishu webhook
- Telegram bot token

When a token is missing, collectors/notifiers must skip or use stubs with structured degradation, not crash application startup.

## Emergency

1. Check `docker compose ps`.
2. Check backend readiness with `curl -fsS http://localhost/readyz`.
3. Check metrics with `curl -fsS http://localhost/metrics`.
4. Restart a single service with `docker compose up -d --build <service>`.
5. If PostgreSQL is damaged, restore from the latest backup into a fresh database first, then repoint `DATABASE_URL`.
