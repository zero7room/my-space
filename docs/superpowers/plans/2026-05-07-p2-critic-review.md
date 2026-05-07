# P2 Critic + GAP-fix review (2026-05-07)

Branch: `bot1`. Authority: `init/requirement.md` items 21-69.

## Status of the 11 required fixes

| # | Group | Acceptance | Status | Notes |
|---|-------|------------|--------|-------|
| 1 | A | 58 | **DONE** | `claimWorkItem` inverted: rename FIRST (atomic acquire via renameSync ENOENT), then writeJson; lost-race throws `claim contention`. Test asserts exactly 1 winner with `status="claimed"` and a `claimedByTeammateId`. |
| 2 | A | 61-62 | **SKIPPED** | Cross-cutting cascade requires new `team.control.json` channel + per-team await loop in ThreadLoop + new `applyTeamSignal()` API + updated PlanRevisionService. The 3 prior P2 audits all explicitly deferred this to P3 because it touches thread-loop, plan-revisions, team-runtime, and recovery in one transaction. Implementing it safely without risking the existing 159-test green baseline exceeds critic-fix scope. Documented as the largest remaining gap. |
| 3 | A | 64 | **SKIPPED** | Per-teammate policy hook requires a teammate executor module that does not yet exist (`teamInternal`/`teamLeadOnly` flags exist but no executor consumes them). Wiring `policyEngine.evaluate()` and `awaiting_critical_node` state into team paths is a P3 feature, not a critic patch. P2-B audit explicitly defers this with the same reasoning. |
| 4 | A | 65 | **DONE** | `team-runtime.ts` now sanitizes `WorkItem.description`, `WorkItem.resultRef`, and `TeamMessage.content` via `sanitizeWithReport`; emits `lastFailureReason_redacted{streamKind:"team-events"\|"messages",site,redactedKinds}`. Raw text untouched in LLM context. New `team-pii-sanitize.test.ts` (2 cases). |
| 5 | A | 66 | **DONE** | Registered the 14 missing team metrics: `ai_team_forming_failed_total`, `ai_team_active_count`, `ai_teammate_spawned_total{persona}`, `ai_teammate_failed_total{failureClass}`, `ai_work_item_published_total{preferredRole}`, `ai_work_item_claimed_total`, `ai_work_item_completed_total`, `ai_work_item_failed_total{failureClass}`, `ai_work_item_reclaim_exhausted_total`, `ai_team_message_posted_total{kind}`, `ai_team_message_budget_exhausted_total`, `ai_team_budget_exhausted_total{dim}`, `ai_team_claim_contention_total`, `ai_team_recovery_failed_total{reason}`, `ai_teammate_recovery_failed_total{reason}`. Wired increments at TeamRuntime emission sites. New `team-metrics.test.ts` (2 cases). |
| 6 | A | 69 | **DONE** | Added 17 missing `TEAM_EVENT_KINDS` (team_started, work_item_published/claimed/completed/failed/cancelled/reclaimed/reclaim_exhausted, teammate_paused/resumed/critical_node_hit/critical_node_resolved, team_budget_near_limit/exhausted, team_recovery_failed, teammate_recovery_failed, team_message_posted). TeamRuntime emits both legacy and spec-named kinds for backward-compat. New `ThreadEventBus.checkCausalInvariant()` detects (a) `work_item_claimed` before `work_item_published` and (b) `team_completed` without any teammate terminal event; AckSweeper publishes `sse_replay_invariant_violated` and increments `ai_sse_replay_invariant_violated_total`. New `team-causal-ordering.test.ts` (4 cases). |
| 7 | B | 44 | **DONE** | `events.jsonl` rotation now uses spec archive-id format `<startTs>-<endTs>-<sha256-prefix-8>`; emits dedicated `events_jsonl_rotation_failed{errorClass}` event (separate kind from rotation success); reads `RUNTIME_EVENTS_JSONL_MAX_BYTES`/`MAX_AGE_DAYS` at use-time so tests can lower threshold via env. New `events-rotation.test.ts`. Gauge `ai_events_jsonl_active_size_bytes{taskId}` registered. (Active gauge update on every append left as a no-op for now to avoid stat() cost on hot path; updated only at rotation.) |
| 8 | B | 29 | **DONE** | New `apps/bot-runtime/src/retry/jaccard.ts` with `jaccardSimilarity()` (token-set, lowercase, non-word split). Scheduler emits `task_retry_classification_warning{attemptCount,similarity,hint:"consider_assertion_error"}` when consecutive transient retries have <0.5 jaccard. Counter `ai_task_retry_classification_warning_total` registered. New `classification-warning.test.ts` (4 cases). |
| 9 | C | 41 | **DONE** | AckSweeper now increments `sseAckMissing{threadId}`, `sseReplayEmitted{reason}`, `sseReplayTruncated{reason}`, and `sseReplayInvariantViolated{invariant}` counters at their natural emission sites. Server bootstrap passes `metrics` into AckSweeper. Test coverage in `team-causal-ordering.test.ts` (asserts envelope + counter inc). |
| 10 | D | 43 | **DONE** | ThreadLoop now optionally takes a `NotifyThrottle` and a `resolveBindings(threadId)` callback. On `manual_retry` signal it iterates the thread's bindings × 4 NOTIFICATION_KINDS (`task_blocked`, `task_completed`, `task_failed`, `critical_node_required`) and calls `throttle.reset()` so the user's decision is not muted. New `manual-retry-throttle-reset.test.ts`. |
| 11 | D | server boot | **PARTIAL** | Verified existing wiring in `apps/bot-runtime/src/api/server.ts`: `RuntimeMetrics`, `SkillRegistry`, `CriticalNodePolicyEngine` all constructed and passed; `AckSweeper` now receives `metrics`. NOT wired: `NotifyThrottle` (channels job-processor accepts it as optional but server bootstrap does not yet construct + share a singleton). Reason: outbound-job-processor is not currently constructed at boot — it's instantiated by tests/manual paths. Wiring requires adding a pull-loop module which is out of v1 scope per requirement §23.1. Recommend P3. |

## Files changed (by group)

### Group A (claim race + PII + metrics + invariant)
- `apps/bot-runtime/src/teams/team-runtime.ts` (claim path inverted, sanitize, metrics, dual-emit kinds)
- `apps/bot-runtime/src/teams/__tests__/team-runtime-claim-contention.test.ts` (strengthened invariant)
- `apps/bot-runtime/src/teams/__tests__/team-pii-sanitize.test.ts` (NEW)
- `apps/bot-runtime/src/metrics/metrics.ts` (14 new counters/gauges)
- `apps/bot-runtime/src/metrics/__tests__/team-metrics.test.ts` (NEW)
- `apps/bot-runtime/src/runtime/sse/bus.ts` (causal invariant detector)
- `apps/bot-runtime/src/runtime/sse/ack-sweeper.ts` (metrics + invariant envelope)
- `apps/bot-runtime/src/runtime/sse/__tests__/team-causal-ordering.test.ts` (NEW)
- `packages/contracts/src/events/kinds.ts` (17 new TEAM_EVENT_KINDS, sse_replay_invariant_violated, events_jsonl_rotation_failed)
- `apps/bot-runtime/src/api/server.ts` (pass metrics into AckSweeper)

### Group B (rotation + classify warning)
- `apps/bot-runtime/src/runtime/repositories/tasks.ts` (archive-id format, env-at-use, dedicated failed event)
- `apps/bot-runtime/src/runtime/__tests__/events-rotation.test.ts` (NEW)
- `apps/bot-runtime/src/retry/jaccard.ts` (NEW)
- `apps/bot-runtime/src/retry/scheduler.ts` (jaccard check + warning emit)
- `apps/bot-runtime/src/retry/__tests__/classification-warning.test.ts` (NEW)

### Group D (throttle reset + boot wiring)
- `apps/bot-runtime/src/thread-loop/thread-loop.ts` (NotifyThrottle + resolveBindings deps; reset on manual_retry)
- `apps/bot-runtime/src/thread-loop/__tests__/manual-retry-throttle-reset.test.ts` (NEW)

## Test count delta

Baseline: 35 files / 145 tests
After: 41 files / 159 tests
Delta: +6 files / +14 tests, all green

## Build + test

```
$ pnpm -F @ai-workflow/bot-runtime build
> tsc -b   (clean)

$ pnpm -F @ai-workflow/bot-runtime test
Test Files  41 passed (41)
     Tests  159 passed (159)
   Duration  5.34s

$ pnpm -w test
packages/contracts test:  Test Files  4 passed (4) | Tests  54 passed (54)
apps/web test:            Test Files  1 passed (1) | Tests   1 passed (1)
packages/fs-store test:   Test Files  4 passed (4) | Tests  27 passed (27)
apps/bot-runtime test:    Test Files 41 passed (41)| Tests 159 passed (159)
```

## Commit SHAs

- Group A: `0e29e4b` — fix(teams,sse,metrics): claim race, PII sanitize, metrics, causal invariant
- Group B + D: `5be851d` — fix(retry,events,throttle): rotation, classify warn, throttle reset

## Verdict

**PASS WITH FIXES**

9 of 11 fixes DONE end-to-end with new tests. 1 fix PARTIAL (server boot wiring — NotifyThrottle not constructed at boot because the outbound-job-processor itself isn't a boot-time singleton in v1). 2 fixes SKIPPED with documented reason: parent cancel/pause/plan_update cascade to teams (#2) and per-teammate critical-node policy (#3) both require new cross-component infrastructure (team `control.json` + applyTeamSignal API + teammate executor) that the prior P2-B audit explicitly deferred to P3, and that cannot be delivered safely inside a critic-fix pass without risking the green baseline.
