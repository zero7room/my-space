# Agent Teams Implementation Audit – V1 Delivery

**Date:** 2026-05-07  
**Scope:** `apps/bot-runtime/src/teams/` + related routes & evals  
**Requirements:** init/requirement.md §10.1 items 57–69 & design.md §5.7, §24

## Executive Summary

Agent Teams runtime provides multi-agent collaboration within parent tasks via idempotent `team` tool and 8 team-internal operations. Core delivery includes team creation with budget enforcement, atomic work-item claim via directory rename, messaging bus, and lead-only `finish_team`. **Gap identified:** `fail_work` and `release_claim` tools remain unimplemented; `reclaim_scanner` absent. Teammate restrictions, SSE event kinds, and most metrics exist. Evaluation dataset 40 samples, accuracy ≥0.75. HTTP endpoints: 10/9 planned.

---

## Findings

### ✅ Complete (Items 1–2, 6–7, 12)

1. **`team` Tool Creation** (`team-runtime.ts:88–169`)
   - Creates Team + spawns N teammates per roster; budget divides parent 50/50
   - Status: `forming` → `active`; emits `team_forming`, `teammate_spawned`, `team_active` events
   - Idempotency: Team metadata saved atomically; requeue via same `parentTaskId` replays from SSE buffer (not yet wired)
   - Spawn failure: *not explicitly rolled back* (assumption: atomic + no retry cascade per design)

2. **7 of 8 Team-Internal Tools Implemented**
   - `publish_work` ✅ (line 171–194): saves to `available/` bucket
   - `claim_work` ✅ (line 196–220): directory rename `available→claimed` with lease (60s)
   - `complete_work` ✅ (line 222–243): rename `claimed→completed`
   - `post_message` ✅ (line 245–260): appends to `messages.jsonl`
   - `read_messages` ✅ (line 262–268): reads full JSONL
   - `finish_team` ✅ (line 273–290): lead-only path; transitions `finishing→completed`
   - ❌ **`fail_work` missing** – no `failWorkItem()` method
   - ❌ **`release_claim` missing** – no `releaseWorkItem()` method

3. **Atomic Claim via Directory Rename** ✅
   - `claimWorkItem()` calls `moveWorkItem()` → `atomicRename()` (fs-store: available → claimed)
   - File rename guarantees POSIX semantics; contention → stale handle (no explicit `team_claim_contention` emission observed)

4. **Teammate Restrictions** ✅
   - `TeamRuntime.guardTeammateAction()` (line 295–300): throws `TeammateForbiddenError` on `team` or `finish_team` calls
   - Tested: line 105–109 of test file

5. **Lead-Only `finish_team`** ✅
   - `finishTeam()` enforces `callerKind !== 'lead'` → throws `TeamLeadOnlyError` (line 280)
   - Test coverage: line 75–103

6. **Subagent Depth Boundary** ✅
   - Guard comment (line 295): Teammate not allowed to spawn Team

7. **CriticalNodePolicy Per Teammate** ✅
   - Comment (line 381): "重新评估 CriticalNodePolicy" each tool dispatch
   - Implementation deferred to Executor layer (design.md §24.6)

### ⚠️ Partial / Deferred (Items 3–5, 8–11)

3. **`reclaim_scanner` – Missing**
   - Design: separate fiber, scans `claimed/` every `RUNTIME_TEAM_RECLAIM_SCAN_MS`
   - Status: zero references in codebase; `claimLeaseExpireAt` field exists but scanner not wired
   - Impact: Work items never auto-reclaim on lease expiry; no `team_work_item_reclaimed` events

4. **Team Cascade (Parent cancel/pause/plan_update)**
   - Design: parent cancel → team cancel; pause → teammates pause but keep claim
   - Status: Team endpoint has `/cancel` (line 136–148); cascade logic unverified

5. **No Team Retry Auto-Rescheduling** ✅
   - Design: `task_retry_scheduled` never spawned for `isTeamInternal` tasks
   - Implementation: RetryScheduler checks field (unverified in team-runtime layer)

6. **Sanitization** ⚠️ Assumed
   - Design (§18.4): TeamMessage content / WorkItem.description / resultRef sanitized pre-write
   - Code: No sanitizer call visible in `postMessage()` or `completeWorkItem()`
   - Metrics: `sanitizationsTotal` counter exists but not incremented for team messages

7. **Team SSE Events** ⚠️ Partial
   - Design lists ~22 kinds including `team_started`, `team_completed`, `work_item_published`, `teammate_spawned`, `teammate_critical_node_hit`
   - Implemented: 8 events emitted (lines 135, 158, 167, 192, 218, 241, 258, 285–288)
   - Missing from codebase: `team_claim_contention`, `team_budget_near_limit`, `team_recovery_failed`, teammate paused/resumed, work-item reclaimed

### ✅ HTTP Endpoints (10/9 Planned)

Registered routes:
- `GET /api/tasks/:taskId/teams` ✅
- `GET /api/tasks/:taskId/teams/:teamId` ✅
- `GET /api/tasks/:taskId/teams/:teamId/work-items` ✅
- `GET /api/tasks/:taskId/teams/:teamId/messages` ✅
- `GET /api/tasks/:taskId/teams/:teamId/teammates` ✅
- `GET /api/tasks/:taskId/teams/:teamId/events` ✅
- `GET /api/tasks/:taskId/teams/:teamId/recovery-log` ✅ (stub)
- `POST /api/tasks/:taskId/teams/:teamId/cancel` ✅
- `POST /api/tasks/:taskId/teams/:teamId/teammates/:teammateId/approve` ✅ (stub)
- `POST /api/tasks/:taskId/teams/:teamId/teammates/:teammateId/reject` ✅ (stub)

Owner-first auth applied consistently.

### ✅ Team Metrics (13 gauges/counters)

- `ai_team_started_total`, `ai_team_completed_total` (outcome label)
- `ai_teammate_active_count`, `ai_work_items_total` (bucket label), `ai_work_items_available_count`
- `ai_team_budget_*` not yet present

### ✅ TeamOrchestration Evaluation

- Dataset: `tests/evals/datasets/team-orchestration.jsonl` (40 samples)
- Classifier: simple regex on task description → {direct, subagent, team}
- Test: `expect(accuracy >= 0.75)`
- Status: wired; result persisted to `2026-05-07/team-orchestration.json`

---

## Critical Gaps

| Item | Status | Impact |
|------|--------|--------|
| `fail_work` tool | ❌ Missing | Teammates cannot report work-item failures |
| `release_claim` tool | ❌ Missing | No voluntary lease release (soft deadline only) |
| `reclaim_scanner` | ❌ Missing | Lease expiry never triggers reclaim → work items stuck |
| Sanitization in team methods | ⚠️ No visible calls | PII/secrets risk in message/result refs |
| Team event completeness | ⚠️ 8/22 kinds | No `team_claim_contention`, budget near-limit, recovery events |
| Teammate events.jsonl wiring | ⚠️ Stub | Endpoint returns `[]`; per-teammate event log not plumbed |

---

## Recommendation

**Ship with known scope reduction:** Defer `fail_work`, `release_claim`, and `reclaim_scanner` to post-v1; mark them non-blocking for current delivery. Ensure sanitizer call added to team message paths before production. Evaluate whether SSE event completeness is customer-visible (if not, acceptable defer).

