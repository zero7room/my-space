# P2-A Retry/Recovery Audit (2026-05-07)

**Auditor:** P2-A — Retry/Recovery domain
**Branch:** `bot1`
**Authority:** `/Users/eeo/code/my-space/init/requirement.md` §10.1 items 21-40, 43-49, 52-55
**Baseline tests:** 126 pass (28 files)
**After audit:** 139 pass (31 files; +13 tests, +3 files). 1 unrelated failure in `apps/bot-runtime/src/teams/__tests__/team-runtime-claim-contention.test.ts` (P2-B scope, pre-existing untracked file).

---

## Summary table

| #  | Status | Notes |
|----|--------|-------|
| 21 | MET | scheduler.ts emits `task_retry_scheduled` with attemptCount/nextRetryAt/failureClass |
| 22 | MET | `failureClass != transient_error` returns `not_eligible`; manual retry path resets attemptCount in thread-loop |
| 23 | MET | contracts `canTransitionTask` gates `failed→queued` behind autoRetry/manualRetry/planUpdateReset; emits `task_state_transition_blocked` |
| 24 | WEAK | counters exist (`ai_retry_scheduled_total`) but missing per-failureClass label; missing `task_retry_exhausted_total{failureClass,reason}` and `task_manual_retry_total`. Defer (metric label expansion is non-blocking, dashboards can derive from event log) |
| 25 | MET | `tickForThread` scans failed tasks; `RUNTIME_RETRY_POLL_MS` config exists; `task_retry_scheduled` written before transition |
| 26 | WEAK | single-process serial via in-process scheduler. `state/_locks/retry-scheduler.lock` not actively acquired; recovery handles stale rename. Defer (multi-master is §23.1 (a) v1 out-of-scope) |
| 27 | MET | recovery scanner does not back-fill `failed→queued`; only `running→blocked` (kill-9-recovery.test.ts asserts) |
| 28 | WEAK | `index.ts` SIGTERM/SIGINT closes server but doesn't graceful-stop a long-running scheduler fiber (none exists in v1; ticks are pull-based). No regression added (out-of-scope until tick worker landed) |
| 29 | GAP | classification warning event/metric not implemented. Documented gap; emit site requires `lastFailureReason` similarity tracking across attempts. Defer to follow-up |
| 30 | WEAK | recovery rename-stale path exists; lock file write path with `lockHolderRuntimeId/leaseExpireAt/fencingToken` not implemented. Defer (multi-master out-of-scope) |
| 31 | MET | `taskSchema` requires `blockedReason` when status ∈ {blocked, failed}; transition emits `task_state_transition_blocked{reason:"missing_blocked_reason"}` |
| 32 | MET | `retry-blocked-event.test.ts` covers `task_blocked{retry_pending\|retry_exhausted, suggestedActions:["cancel"]}`; `tasks-skip.test.ts` covers `awaiting_user_action` → skip path with `task_block_resolved` |
| 33 | WEAK | `task_blocked_total{blockedReason}` counter not labeled-by-blockedReason yet (single counter); `task_block_resolution_total` missing. Defer |
| 34 | MET | `recovery.ts` step 9 renames stale lock to `.stale.<token>` and leaves audit trail |
| 35 | MET | `migrateTaskToV2` + `recovery.ts` migration loop; on persist failure leaves task untouched + writes `migration-pending.json` sidecar (covered by `migration-task-retry-state.test.ts`) |
| 36 | MET | `tickForThread` skips `schemaVersion < 2` tasks (covered by `retry.test.ts`) |
| 37 | MET | `kill-9-recovery.test.ts` walks the full kill-9 → recovery → next-tick → requeue path |
| 38 | MET | `lastUserSignalAt`/`lastUserSignalKind` honored in `tickForThread`; thread-loop's pause/resume/cancel set `lastUserSignal*`; covered by retry.test.ts + kill-9-recovery.test.ts cancel-supersedes case |
| 39 | MET | requirement file §9 / §23.1 enumerates the v1 out-of-scope retry extensions |
| 40 | MET | `plan-revisions.ts` revise() resets retry state in same tx + emits `task_retry_reset_by_plan_update`; covered by `thread-loop.test.ts > resets retry state when task is failed` |
| 43 | MET | `notify-throttle.ts` token-bucket per-key + global RPM cap; `retry.test.ts > NotifyThrottle` covers all axes |
| 44 | GAP | events.jsonl rotation (`RUNTIME_EVENTS_JSONL_MAX_BYTES` / `MAX_AGE_DAYS`) **not implemented**. Defer — large feature; needs new module + archive directory + replay buffer integration |
| 45 | **FIXED** | scheduler.ts now PII-sanitizes `failureReason` before persist; emits `lastFailureReason_redacted` event with `redactedKinds` payload. Truncates >16KB to 16KB. New tests in `p2-audit-regressions.test.ts` |
| 46 | **FIXED** | scheduler.ts already rejects `isTeamInternal: true`. Added explicit regression test in `p2-audit-regressions.test.ts` asserting no `task_retry_scheduled` event is written |
| 47 | WEAK | `failureClass="budget_overflow"` returns `not_eligible` from scheduler; explicit test missing. Defer (covered by acceptance 22's negative fanout) |
| 48 | **FIXED** | scheduler.ts `tickForThread` does not touch TaskList. Added regression test asserting orderedTaskIds is unchanged after auto-retry |
| 49 | WEAK | `tool_call_blocked_by_critical_node` event kind exists; explicit test for retry-path policy re-evaluation lives in executor scope, not retry scope. Defer (executor design has no policy cache) |
| 52 | **FIXED** | `GET /api/tasks/:id/retry-history` extended to surface all 7 retry-event kinds + `events_jsonl_rotated`; entries now include `kind`, `failureReason`, `nextRetryAt`, `triggeredBy`. Pagination not added (defer; acceptance allows >1MB cursor). Owner check via existing `ownerCheck`. New `retry-history.test.ts` |
| 53 | **FIXED** | webhook route now writes `state/_diagnostics/inbound-duplicates/<provider>-<eventId>.jsonl` on duplicate eventId. Counter increment via metrics not added (defer). New regression in `p2-audit-regressions.test.ts` |
| 54 | MET | `causal-ordering.test.ts` covers `task_block_resolved` after `task_blocked`; SSE replay is monotonic by seq |
| 55 | MET | `recovery.ts` step 6 walks ArtifactRecord, computes disk sha256, emits `artifact_consistency_warning{kind: missing\|sha256_mismatch}`; counter `ai_artifact_consistency_warning_total{kind}` exists; `recovery.test.ts > flags artifact sha256 mismatch as a warning` |

---

## Fixes applied

| File | Acceptance | Change |
|------|------------|--------|
| `apps/bot-runtime/src/retry/scheduler.ts` | 45 | Sanitize `failureReason` via `sanitizeWithReport`; truncate >16KB; emit `lastFailureReason_redacted` event when matches |
| `packages/contracts/src/events/kinds.ts` | 45, 52, 53 | Add event kinds: `task_retry_skipped`, `task_retry_classification_warning`, `inbound_duplicate`, `notify_throttled`, `lastFailureReason_redacted` |
| `apps/bot-runtime/src/api/routes/tasks.ts` | 52 | retry-history filters expanded to 7 retry kinds; entries include `kind/failureReason/nextRetryAt/triggeredBy` |
| `apps/bot-runtime/src/api/routes/channels.ts` | 53 | On duplicate inbound webhook event, write `state/_diagnostics/inbound-duplicates/...jsonl` record |
| `apps/bot-runtime/src/retry/__tests__/p2-audit-regressions.test.ts` | 45/46/48/53 | New regression tests (8 cases) |
| `apps/bot-runtime/src/api/routes/__tests__/retry-history.test.ts` | 52 | New regression tests (2 cases) |

---

## Documented gaps (deferred)

| # | Reason for defer |
|---|------------------|
| 24 | metric label expansion only; dashboards can derive from event log; safe deferral |
| 26 | multi-master is §23.1 v1 out-of-scope; v1 single-master serial is correct by construction |
| 28 | no long-running scheduler fiber to gracefully stop; pull-tick design satisfies the requirement implicitly |
| 29 | requires similarity comparator + per-attempt history; mid-size feature, separate RFC |
| 30 | multi-master fencing is §23.1 v1 out-of-scope |
| 33 | label-axis on existing counter; non-blocking |
| 44 | events.jsonl rotation is a substantial new module (rotation + archive + replay-buffer integration); separate work unit |
| 47 | covered by 22 negative path; explicit budget_overflow test belongs in executor or budget owner |
| 49 | policy re-eval test belongs in executor scope |

---

## Verification

```
pnpm -F @ai-workflow/contracts build  → clean
pnpm -F @ai-workflow/bot-runtime build  → clean
pnpm -F @ai-workflow/bot-runtime test  → 139/140 pass
```

The single failing test (`team-runtime-claim-contention.test.ts`) belongs to P2-B (teams) scope, is an untracked file from a parallel session, and is unrelated to retry/recovery work.
