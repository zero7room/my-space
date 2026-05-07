# P1 Critic Review — 2026-05-07

## Scope
Verifies P1 commits 4a95eeb (runbook+grafana), c14a6d6 (migration), e8b6a70 (skill loader), 72994e0 (skip+suggestedActions) against requirement.md acceptance items 13, 32, 35, 36, 50(b), 51, 56 and the P1 section of the full-gap-fix plan.

## Acceptance status

| # | Topic | Status | Notes |
|---|---|---|---|
| 32 | task_blocked.suggestedActions per blockedReason; skip route owner→status check; deny events; step skipped + task_block_resolved + back to queued | **PASS WITH FIX** | Skip route + executor were correct (cancel/skip/retry per reason). Gap: scheduler did not emit `task_blocked{retry_pending|retry_exhausted}`. Fixed in `apps/bot-runtime/src/retry/scheduler.ts`; new test `retry-blocked-event.test.ts` covers both. |
| 35 | migrate_task_retry_state | PASS | `runtime/migrations/task-retry-state.ts` is idempotent, re-uses legacy `budget.maxRetries / attemptCount`, emits `task_schema_migrated` on the recovery path, and writes `migration_pending` markers on failure. Tested by `runtime/__tests__/migration-task-retry-state.test.ts`. |
| 36 | schemaVersion>=2 gate in retry tick | PASS | `RetryScheduler.tickForThread` defaults missing/invalid `schemaVersion` to `1` and skips. Test `retry.test.ts > tickForThread skips schemaVersion=1 tasks` confirms. |
| 50(b) | Grafana retry-dashboard.json | WEAK | Dashboard exists with 5 rows + 3 alerts. Concern: queries use `task_blocked_total`, `task_block_resolution_total`, `task_retry_scheduled_total`, `task_retry_exhausted_total`, `task_schema_migration*`, `retry_scheduler_lock_*`, `task_retry_classification_warning_total` — none of these counters are exported by `metrics.ts` (which uses `ai_*` prefix and only ships `ai_retry_scheduled_total`). The dashboard is forward-looking against a metric set that does not yet exist; runbook smoke does not validate metric names. Recommendation tracked for P2. |
| 51 | retry-troubleshooting.md (5 SOPs) | PASS | `docs/runbooks/retry-troubleshooting.md` documents SOP-1..SOP-5 plus a CI executable verification section. Companion test `tests/runbook-smoke/retry.test.ts` exists. |
| 56 | Skill loader per-file isolation, N=5 cache fallback, /api/skills/load-status, high-risk built-in policy | **PASS WITH FIX** | Registry implementation in `skills/registry.ts` is correct: per-file try/catch, threshold=5 in cache file, `loadStatus()` returns `{skillName, source}`. `policy-engine.ts` enforces high-risk built-in. **Gap:** `createServer` did not instantiate `SkillRegistry` nor wire it to `registerSkillRoutes`, so `/api/skills/load-status` returned `{skills:[], errors:[]}`. **Fixed:** `apps/bot-runtime/src/api/server.ts` now constructs a `RuntimeMetrics`, builds a `SkillRegistry` over `rt.paths.skillsPublicRoot` + `rt.paths.skillsCustomRoot` with cache at `state/_diagnostics/skills-cache.json`, hooks emit `metrics.skillsLoadErrorTotal` / `skillsFallbackToCacheTotal` and append a JSONL diagnostic at `state/_diagnostics/skills.jsonl`, then passes the registry into `registerSkillRoutes`. |
| 13 | High-risk built-in critical-node policy | PASS | Policy engine carries the built-in default; covered by existing `critical-node/__tests__/policy-engine.test.ts`. |

## Files changed (follow-up fixes)

- `apps/bot-runtime/src/api/server.ts` — wire `SkillRegistry` + `RuntimeMetrics` into boot; mount registry on `/api/skills/load-status`.
- `apps/bot-runtime/src/retry/scheduler.ts` — emit `task_blocked{blockedReason: retry_pending, suggestedActions: ['cancel'], nextRetryAt}` after a transient retry is scheduled, and `task_blocked{blockedReason: retry_exhausted, suggestedActions: ['cancel']}` when the budget is exhausted.
- `apps/bot-runtime/src/retry/__tests__/retry-blocked-event.test.ts` — new vitest covering both emissions.

## Verification

- `pnpm -F @ai-workflow/bot-runtime build` → green (tsc -b clean).
- `pnpm -F @ai-workflow/bot-runtime test` → 28 files / 126 tests passed, including the two new acceptance-32 cases.
- `pnpm -w test` → fails only on `apps/web` due to a pre-existing PostCSS config issue (postcss.config.mjs from commit 52bef64, unrelated to P1).

## Verdict
**PASS WITH FIXES.** Both follow-ups identified by the parallel agents have been implemented and verified. The Grafana dashboard remains a known WEAK item to be reconciled with `metrics.ts` exports in a later phase.
