.PHONY: \
	help \
	dev \
	deploy \
	verify \
	verify-m0 \
	verify-stack \
	verify-pre-commit \
	verify-docs \
	verify-root \
	verify-migrations \
	backend-sync \
	backend-lint \
	backend-format \
	backend-typecheck \
	backend-test \
	backend-verify \
	backend-openapi \
	backup \
	web-install \
	web-lint \
	web-typecheck \
	web-test \
	web-codegen-check \
	web-e2e \
	web-verify \
	verify-e2e \
	verify-compose

help:
	@printf '%s\n' 'Targets:'
	@printf '%s\n' '  dev             Start the full local stack with Docker Compose'
	@printf '%s\n' '  verify          Run docs, backend, and web verification'
	@printf '%s\n' '  verify-m0       Run the full M0 acceptance suite'
	@printf '%s\n' '  verify-stack    Build/start the full compose stack and check health'
	@printf '%s\n' '  verify-pre-commit  Run all pre-commit hooks with uvx'
	@printf '%s\n' '  verify-docs  Check ADR index and required metrics ADR content'
	@printf '%s\n' '  verify-root  Check root engineering baseline files'
	@printf '%s\n' '  backend-verify  Run backend lint, typecheck, and tests'
	@printf '%s\n' '  web-verify      Run web lint, typecheck, and tests'
	@printf '%s\n' '  verify-e2e      Run Playwright E2E'
	@printf '%s\n' '  verify-compose  Validate Docker Compose config'

dev:
	docker compose up --build

deploy:
	docker compose up -d --build --force-recreate

backup:
	scripts/backup.sh

verify: verify-root verify-docs backend-verify web-verify

verify-m0: verify-root verify-docs verify-compose verify-migrations backend-verify backend-openapi web-codegen-check web-verify verify-e2e verify-stack

verify-pre-commit:
	uvx pre-commit run --all-files
	tmp_good=$$(mktemp) && tmp_bad=$$(mktemp) && \
		printf 'feat(m0): add baseline\n' > "$$tmp_good" && \
		printf 'add baseline\n' > "$$tmp_bad" && \
		python3 scripts/check_conventional_commit.py "$$tmp_good" && \
		! python3 scripts/check_conventional_commit.py "$$tmp_bad"

verify-stack:
	docker compose up -d --build --force-recreate
	docker compose ps --status running --services | grep -qx pg
	docker compose ps --status running --services | grep -qx redis
	docker compose ps --status running --services | grep -qx backend
	docker compose ps --status running --services | grep -qx worker
	docker compose ps --status running --services | grep -qx web
	docker compose ps --status running --services | grep -qx caddy
	curl -fsS http://localhost/healthz >/dev/null
	curl -fsS http://localhost/readyz >/dev/null
	curl -fsS http://localhost/api/v1/ping >/dev/null

verify-docs:
	@test -f docs/decisions/README.md
	@test -f docs/decisions/ADR-001-metrics-naming.md
	@for adr in docs/decisions/ADR-*.md; do \
		name=$$(basename "$$adr"); \
		grep -q "$$name" docs/decisions/README.md || { echo "Missing ADR index entry: $$name"; exit 1; }; \
	done
	@grep -q '决议初值来源 = requirements §14/§15（含本期 16 项）+ 后续 ADR' docs/decisions/README.md
	@grep -q 'runs_total{skill,status,trigger}' docs/decisions/ADR-001-metrics-naming.md
	@grep -q 'alerts_total{priority,channel,state}' docs/decisions/ADR-001-metrics-naming.md
	@grep -q 'llm_tokens_total{provider,model,task_kind}' docs/decisions/ADR-001-metrics-naming.md
	@grep -q 'collector_failures_total{source,error_type}' docs/decisions/ADR-001-metrics-naming.md
	@grep -q 'subject_id' docs/decisions/ADR-001-metrics-naming.md
	@grep -q 'M1-M6 新增 metric 必须先 append 到此 ADR' docs/decisions/ADR-001-metrics-naming.md

verify-root:
	@test -f .gitignore
	@test -f .pre-commit-config.yaml
	@test -f Makefile
	@test -f README.md
	@test -f package.json
	@test -f pnpm-workspace.yaml
	@test -f docker-compose.yml
	@test -f Caddyfile
	@test -f backend/Dockerfile
	@test -f web/Dockerfile

backend-sync:
	cd backend && uv sync --all-groups

backend-lint:
	cd backend && uv run ruff check .

backend-format:
	cd backend && uv run ruff format --check .

backend-typecheck:
	cd backend && uv run mypy

backend-test:
	cd backend && uv run pytest -q

verify-migrations:
	cd backend && uv run alembic upgrade head
	cd backend && uv run alembic downgrade base
	cd backend && uv run alembic upgrade head

backend-openapi:
	cd backend && uv run python scripts/export_openapi.py

backend-verify: backend-lint backend-format backend-typecheck backend-test

web-install:
	pnpm --dir web install --frozen-lockfile

web-lint:
	pnpm --filter @my-space/web lint

web-typecheck:
	pnpm --filter @my-space/web typecheck

web-test:
	pnpm --filter @my-space/web test

web-codegen-check:
	cd web && OPENAPI_URL=../backend/openapi.json pnpm gen:api
	git diff --exit-code -- web/lib/api/schema.ts

web-e2e:
	pnpm --filter @my-space/web test:e2e

web-verify: web-lint web-typecheck web-test

verify-e2e: web-e2e

verify-compose:
	docker compose config --quiet
