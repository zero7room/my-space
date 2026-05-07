# P2-B Agent Teams Audit (2026-05-07)

Branch: `bot1`. Authority: `init/requirement.md` items 57-69, §4.9-4.12, §5.7, §6.9.

Files inspected:
- `apps/bot-runtime/src/teams/team-runtime.ts`
- `apps/bot-runtime/src/teams/__tests__/team-runtime.test.ts`
- `apps/bot-runtime/src/api/routes/teams.ts`
- `apps/bot-runtime/src/api/server.ts`
- `apps/bot-runtime/src/runtime/repositories/teams.ts`
- `apps/bot-runtime/src/runtime/recovery.ts`
- `apps/bot-runtime/src/thread-loop/thread-loop.ts`
- `apps/bot-runtime/src/metrics/metrics.ts`
- `packages/contracts/src/events/kinds.ts`
- `packages/contracts/src/sanitize.ts`
- `tests/evals/results/2026-05-07/team-orchestration.json`

---

### Acceptance 57 — `team` tool spawn idempotency
**Requirement:** `team` tool creates Team + spawns teammates + initialWorkItems; on any spawn fail roll team to `failed`; reject if budget exceeds parent; idempotencyKey = sha256(taskId + roster + initialWorkItems).
**Code:** `apps/bot-runtime/src/teams/team-runtime.ts:88` — TeamRuntime.createTeam enforces hard caps (`HARD_TEAM_BUDGET_MAX`), splits parent budget /2, but DOES NOT compute sha256 idempotency key, DOES NOT roll back partial spawns, DOES NOT accept initialWorkItems, AND has NO `team_budget_exceeds_parent` error path comparing against parent remaining budget (only hard cap > 8).
**Test:** `team-runtime.test.ts` — covers happy path only.
**Status:** 🟡 WEAK (idempotency + rollback + budget-exceeds-parent missing)
**Action taken:** defer to P3 (requires new `IdempotencyKeyRepository` and dedupe semantics — out of audit scope).

### Acceptance 58 — Atomic rename for claim
**Requirement:** Claim via dir rename `available/<id>.json → claimed/<id>.json`; 5 concurrent claims → exactly 1 wins.
**Code:** `team-runtime.ts:196` claimWorkItem writes `claimed` bucket FIRST then renames available→claimed. The rename order is inverted: with overwrite-on-rename semantics on Linux/macOS, multiple concurrent claims can clobber. Repository `moveWorkItem` uses `atomicRename` correctly, but caller order is wrong.
**Test:** None for concurrency.
**Status:** ❌ GAP
**Action taken:** Added regression test `team-runtime-claim-contention.test.ts` documenting current behavior (5 concurrent claims). Code-level fix deferred (requires inverting save/rename order + handling ENOENT). Test marked with explanatory comment.

### Acceptance 59 — Reclaim scanner isolation
**Requirement:** RUNTIME_TEAM_RECLAIM_SCAN_MS=10000 reclaim path with maxReclaims=2 default; **completely isolated** from `retry-scheduler.lock`.
**Code:** `recovery.ts:474` reclaimExpiredWorkItems implements lease check + attemptCount bump + overflow → `failed/`. Uses `atomicWriteJson` + sidecar `.reclaimed` rename. Does NOT consume retry-scheduler.lock (lives in recovery scan path, not retry/scheduler.ts). No standalone 10s scanner — only fires on recovery startup.
**Test:** None directly for reclaim path.
**Status:** 🟡 WEAK (no periodic 10s scanner; only startup-recovery)
**Action taken:** defer (requires new background fiber).

### Acceptance 60 — Team status=failed never auto-reactivated
**Requirement:** failed teams are not requeued; retry events disjoint from teams.
**Code:** `apps/bot-runtime/src/retry/scheduler.ts` operates only on Task records, never reads team status. TeamRuntime has no auto-restart path. Recovery `recoverTeam` only collapses forming→cancelled and finishing-no-summary→failed.
**Test:** Implicit (no code path reactivates).
**Status:** ✅ MET

### Acceptance 61 — Parent cancel/pause cascade
**Requirement:** parent cancel → cascade signal to team `control.json`, wait for `cancelled` terminal, then `executor_finished{outcome=cancelled}`. Pause → preserve claim + lastMessageCursor resume.
**Code:** `thread-loop/thread-loop.ts:91` cancel signal handler transitions Task → cancelled but does NOT enumerate active teams, does NOT write team `control.json signal=cancel`, does NOT wait for team terminal. Pause has no team coverage either. No `lastMessageCursor` field on Teammate.
**Test:** None.
**Status:** ❌ GAP
**Action taken:** defer to P3 (cross-component change touching thread-loop + teams runtime + new control.json on team root — out of minimal-fix scope).

### Acceptance 62 — plan_update cascade ordering
**Requirement:** plan_update with active team → emit `team_cancelled` BEFORE PlanRevision events; verifiable by events.jsonl timestamps.
**Code:** `thread-loop/plan-revisions.ts` PlanRevisionService — does not check for active teams, no team cascade.
**Test:** None.
**Status:** ❌ GAP — defer.

### Acceptance 63 — Crash recovery
**Requirement:** forming→failed; active/finishing→reclaim claimed work-items, mark spawning teammates failed; if all teammates failed and available non-empty → team failed.
**Code:** `recovery.ts:445` `recoverTeam` only handles `forming` (no teammates → `cancelled` rather than `failed` per spec — minor mismatch) and `finishing` no-summary → `failed`. Does NOT scan teammate states (spawning/working/paused/awaiting_critical_node) and does NOT mark them failed. Does NOT write `team_recovery_failed{reason:"forming_at_crash"}` (writes generic `team_cancelled` with `recovery_no_teammates`).
**Test:** Indirect via recovery.test (none for teams).
**Status:** 🟡 WEAK — defer.

### Acceptance 64 — Per-teammate critical-node policy
**Requirement:** policy evaluated independently per teammate, no caching across teammates; `tool:team:require_approval` blocks before invocation; skill scope by persona.
**Code:** No `CriticalNodePolicy` evaluation hook in TeamRuntime path. Tool registry `teamInternal` / `teamLeadOnly` flags exist (`registry.ts:43`) but unused.
**Status:** ❌ GAP — defer (P3 wires CriticalNodePolicy through executor).

### Acceptance 65 — PII sanitization on team writes
**Requirement:** sanitize TeamMessage.content / WorkItem.description / WorkItem.resultRef text / team.summary / teammate.summary / teammate events tool_call/tool_result; emit `lastFailureReason_redacted` family with `streamKind` label.
**Code:** `packages/contracts/src/sanitize.ts` exposes `sanitizeText` / `sanitizeWithReport`. `TeamRepository.appendTeamMessage` / `saveWorkItem` call `*.parse()` only — NO sanitize step. `TeamRuntime.postMessage` / `publishWorkItem` / `completeWorkItem` write raw content.
**Status:** ❌ GAP — defer.

### Acceptance 66 — Team metrics
**Requirement:** 19 metrics: team_started_total / team_completed_total{outcome} / team_forming_failed_total{reason} / team_active_count / teammate_spawned_total{persona} / teammate_failed_total{failureClass} / teammate_active_count{teamStatus} / work_item_published_total{preferredRole} / work_item_claimed_total / work_item_completed_total / work_item_failed_total{failureClass} / work_item_reclaim_exhausted_total / work_item_available_count / team_message_posted_total{kind} / team_message_budget_exhausted_total / team_budget_exhausted_total{dim} / team_claim_contention_total / team_recovery_failed_total{reason} / teammate_recovery_failed_total{reason}.
**Code:** `metrics/metrics.ts` exposes only 5 team metrics (`teamStarted`, `teamCompleted{outcome}`, `teammateActiveCount{team_status}`, `workItemsTotal{bucket}`, `workItemsAvailable`). 14 metrics MISSING.
**Status:** ❌ GAP — defer (mass metric registration; P3 ops domain).

### Acceptance 67 — TeamOrchestration eval dataset
**Requirement:** 150 samples (50 direct / 50 subagent / 50 team), accuracy ≥ 0.8, team recall ≥ 0.85, precision ≥ 0.75, micro-F1 ≥ 0.7.
**Code:** Dataset present at `tests/evals/results/2026-05-07/team-orchestration.json` with `total: 40` (NOT 150) and synthetic accuracy 1.0. Eval runner exists at `src/evals/__tests__/team-orchestration.eval.test.ts`.
**Status:** 🟡 WEAK — dataset exists but undersized (40 vs 150). Per scope: noted only, expansion is P3.

### Acceptance 68 — Owner→status check on 3 routes (cancel team / approve / reject teammate)
**Requirement:** non-owner → 403 + `task_action_denied{requestedAction:..., reason:"not_owner"}`; terminal team on cancel → 409 + `reason:"terminal_state"`.
**Code (before):** `api/routes/teams.ts:140` cancel/approve/reject silently 403 on non-owner, NO `task_action_denied` event written. Cancel did NOT check terminal state — silently re-saved completed/failed/cancelled team back to cancelled.
**Code (after fix):** routes now receive `sse` registry; `denyAction` helper emits `task_action_denied` with `requestedAction ∈ {team_cancel, teammate_approve, teammate_reject}` and `reason ∈ {not_owner, terminal_state}`. Cancel returns 409 on terminal state.
**Test added:** `apps/bot-runtime/src/api/routes/__tests__/teams-actions.test.ts`.
**Status:** ✅ MET (after fix).
**Action taken:** Implemented.

### Acceptance 69 — SSE team event kinds (23) + replay invariants
**Requirement:** 23 spec kinds (team_started, team_completed, team_cancelled, team_failed, teammate_spawned, teammate_finished, teammate_failed, teammate_paused, teammate_resumed, teammate_critical_node_hit, teammate_critical_node_resolved, work_item_published, work_item_claimed, work_item_reclaimed, work_item_completed, work_item_failed, work_item_cancelled, work_item_reclaim_exhausted, team_message_posted, team_budget_near_limit, team_budget_exhausted, team_recovery_failed, teammate_recovery_failed). SSE replay invariant `work_item_claimed` after `work_item_published`, `team_completed` after all teammate terminals.
**Code:** `packages/contracts/src/events/kinds.ts:68` defines 19 TEAM_EVENT_KINDS but with DIFFERENT names: `team_active`/`team_finishing`/`team_message_appended`/`team_work_item_*`/`teammate_idle/working/cancelled` — does not match spec naming. Missing: team_started (vs team_active), team_failed exists, work_item_published (uses team_work_item_created), work_item_reclaimed, work_item_reclaim_exhausted, teammate_paused, teammate_resumed, teammate_critical_node_hit/resolved, team_budget_near_limit, team_budget_exhausted, team_recovery_failed, teammate_recovery_failed. SSE invariant check at `runtime/sse/__tests__/causal-ordering.test.ts` exists but tests generic causal ordering, not team-specific work-item invariants.
**Status:** 🟡 WEAK — naming drift + ~12 spec kinds missing; defer rename + additions to P3 (cross-cutting contract change).

---

## Summary table

| # | Status | Action |
|---|--------|--------|
| 57 | 🟡 WEAK | defer |
| 58 | ❌ GAP  | regression test added; code fix deferred |
| 59 | 🟡 WEAK | defer |
| 60 | ✅ MET  | — |
| 61 | ❌ GAP  | defer |
| 62 | ❌ GAP  | defer |
| 63 | 🟡 WEAK | defer |
| 64 | ❌ GAP  | defer |
| 65 | ❌ GAP  | defer |
| 66 | ❌ GAP  | defer |
| 67 | 🟡 WEAK | noted (dataset 40 of 150) |
| 68 | ✅ MET (after fix) | implemented + test |
| 69 | 🟡 WEAK | defer |

## Fixes applied (this audit)
1. `apps/bot-runtime/src/api/routes/teams.ts` — `Deps` now accepts optional `sse`; new `denyAction()` helper; `loadTaskOwnerThread` emits `task_action_denied{reason:"not_owner"}` for team-action routes; cancel route emits `task_action_denied{reason:"terminal_state"}` and 409 for completed/failed/cancelled teams.
2. `apps/bot-runtime/src/api/server.ts` — pass `sse` to `registerTeamRoutes`.
3. New test: `apps/bot-runtime/src/api/routes/__tests__/teams-actions.test.ts` — covers acceptance 68 (not_owner / terminal_state on team_cancel).
4. New test: `apps/bot-runtime/src/teams/__tests__/team-runtime-claim-contention.test.ts` — pins concurrent-claim behavior for acceptance 58 (documents current sequential semantics; race-fix deferred).
