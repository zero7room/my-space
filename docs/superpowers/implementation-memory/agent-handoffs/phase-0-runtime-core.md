# Phase 0 Handoff — Runtime Core

## What changed

Root config:
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`
- `vitest.config.ts`, `eslint.config.mjs`
- `.env.example`, `.gitignore` (added node_modules/dist/data/.env)
- `README.md`, `tooling/docker-compose.local.yml`

Workspace packages (all with `package.json` + `tsconfig.json`):
- `packages/contracts` — placeholder `src/index.ts`
- `packages/fs-store` — placeholder `src/index.ts`
- `packages/test-fixtures` — placeholder `src/index.ts`
- `apps/bot-runtime` — `src/index.ts` prints and exits 0
- `apps/web` — build script is a placeholder (Phase 10 owns real Next app)

Implementation memory tree created at
`docs/superpowers/implementation-memory/{phase-status.md,decisions.md,open-risks.md,agent-handoffs/,reviews/}`.

## Tests added

None this phase; all package `test` scripts run vitest with
`--passWithNoTests` / default `passWithNoTests` so they're green.

## Verification

- `pnpm install` ok
- `pnpm -r build` ok
- `pnpm -r test` ok
- `pnpm lint` ok

## Risks / follow-ups

- Placeholder `src/index.ts` files in contracts, fs-store, test-fixtures MUST
  be replaced by real exports in phases 1-3.
- `apps/web` build is a no-op today; Phase 10 will wire Next properly.
