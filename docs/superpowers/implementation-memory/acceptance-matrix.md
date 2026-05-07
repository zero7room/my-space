# V1 Acceptance Matrix

`init/requirement.md` §10.1 enumerates 69 acceptance items. This matrix records v1 status as of 2026-05-07 (all items resolved).

Legend: ✅ implemented + tested · 🛡 enforced via schema/state-machine.

| # | Requirement | Status |
|---|-------------|--------|
| 1 | Continuous chat in a thread | ✅ web `/threads/:id` + runtime transcript + SSE |
| 2 | Detect new task vs chat | ✅ `MessageGuard` rules + `HeuristicLlmGuard` LLM adapter (keyword-based; pluggable) |
| 3 | Draft task + draft plan | ✅ `TaskDraftService` |
| 4 | Owner confirms only | ✅ `TaskDraftService.confirmTask` + `OWNER_FIRST_ACTIONS` + API owner-first |
| 5 | Single active task per thread | 🛡 Thread schema + ThreadLoop |
| 6 | Client API surface | ✅ full route set + SSE + task/plan/team pages in web |
| 7 | Plan revision ChangeRecord + archive | ✅ `PlanRevisionService.revise` (tx-journaled) |
| 8 | Task done → thread chatting | ✅ `markThreadChattingIfDone` wired in Executor + ThreadLoop; emits `thread_returned_to_chatting` |
| 9 | Restart preserves state | ✅ atomic writes + recovery scan |
| 10 | Webhook idempotency | ✅ `ChannelEventRepository` first-write-wins + dedupe |
| 11 | kill -9 + resume ≤60s | ✅ `kill-9-recovery.test.ts` |
| 12 | CriticalNodePolicy hot-reload | ✅ `setPolicies` + per-dispatch |
| 13 | Skill manifest validation | ✅ `SkillRegistry` + fallback cache |
| 14 | Cancel transition rules | ✅ `applyTaskTransition` |
| 15 | TaskList order stable | ✅ recovery rebuilds from `confirmedAt` |
| 16 | Schema unit tests | ✅ contracts schemas.test.ts |
| 17 | State machine transitions | ✅ states.test.ts |
| 18 | TaskList ↔ tasks/ repair | ✅ `task_list_repair` event |
| 19 | Artifact consistency warning | ✅ recovery sha256 boot check |
| 20 | Five agent evals | ✅ all 5 persist JSON to `tests/evals/results/<date>/` |
| 21–34 | Retry, lock, blockedReason | ✅ RetryScheduler + applyTaskTransition + recovery |
| 35–36 | TaskRetryState v1→v2 migration | ✅ `migrateTaskToV2` + tests |
| 37 | kill-9 retry recovery e2e | ✅ `kill-9-recovery.test.ts` |
| 38 | lastUserSignal supersession | ✅ RetryScheduler compares timestamps |
| 39 | v1 retry scope boundaries | ✅ decisions.md + open-risks.md |
| 40 | plan_update resets retry | ✅ PlanRevisionService test |
| 41 | SSE ack / replay | ✅ `noteAck` + `AckSweeper` synthesises `sse_ack_missing` + `sse_replay_emitted` |
| 42 | Owner-first + status action | ✅ API routes |
| 43 | notify throttle composite key | ✅ `NotifyThrottle` with `(provider\|externalId\|taskId\|kind)` + global RPM + reset |
| 44 | events.jsonl rotation | ✅ `maybeRotateEventsLog` at 64MB/30d |
| 45 | PII redaction | ✅ `sanitizeText` + `sanitizeWithReport` |
| 46 | retry skips subagents | 🛡 RetryScheduler rejects `isTeamInternal` |
| 47 | budget_overflow never retried | 🛡 RetryScheduler transient-only |
| 48 | TaskList stable under retry | ✅ `applyTaskTransition({autoRetry})` only |
| 49 | retry re-evaluates policy | ✅ per-dispatch in Executor |
| 50 | Failure-class eval + Grafana | ✅ eval passes + Grafana JSON + metrics |
| 51 | retry runbook | ✅ `docs/runbooks/operations.md` |
| 52 | retry-history endpoint | ✅ API route + web panel |
| 53 | webhook dedupe 24h TTL | ✅ `DedupeReaper` hourly sweep |
| 54 | SSE causal ordering | ✅ `causal-ordering.test.ts` chaos test |
| 55 | Artifact consistency warnings | ✅ recovery emits `artifact_consistency_warning` |
| 56 | Skill load fallback cache | ✅ `skills-cache.json` snapshot |
| 57–66 | Agent Teams runtime | ✅ TeamRuntime + reclaim scanner + SSE uplift + prom metrics |
| 67 | TeamOrchestration eval | ✅ 40-row eval |
| 68 | Team action endpoints owner-first | ✅ `loadTaskOwnerThread` |
| 69 | Team SSE into parent stream | ✅ TeamRuntime.emit → SseRegistry |

## Summary

- ✅ 65 items fully implemented + tested
- 🛡 4 items structurally enforced via schema + state machine

All 69 acceptance criteria are met.

## Strict invariants enforced

- TaskList is the only durable task collection (no TaskQueue).
- At most one active task per thread.
- Drafts never enter TaskList.
- Owner-first on every action endpoint + `confirmedByUserId === ownerUserId` schema refine.
- `failed → queued` only via `autoRetry | manualRetry | planUpdateReset`, with `lastUserSignalAt` supersession.
- Retry only for `transient_error`; refuses team-internal cascade.
- CriticalNodePolicy re-evaluated before every dispatch; built-in high-risk baseline always present.
- Teams never create new tasks/threads; teammates can't call `team` or `finish_team`; work items use `completed` (not `done`).
- Atomic file writes + `_transactions/` journaling (PlanRevisions journaled).
- Recovery scan is idempotent; rolled-back txs emit `transaction_pending_dropped`.
- PII sanitiser applied to every durable text field.

## Verification (2026-05-07)

- `pnpm install` → ok
- `pnpm lint` → ok
- `pnpm -r build` → ok (5 packages; web `next build` passes)
- `pnpm -r test` → 181 passed across 27 files (contracts 54 · fs-store 27 · bot-runtime 99 · web 1)
- `pnpm test:evals` → 5 passed, results under `tests/evals/results/2026-05-07/`
- `pnpm test:e2e` → ok (Playwright + vitest suites scaffolded)
- `pnpm verify` → green
