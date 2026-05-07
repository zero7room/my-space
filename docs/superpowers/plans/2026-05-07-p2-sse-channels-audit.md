# P2-C SSE / Channels / Events acceptance audit — 2026-05-07

Branch: `bot1`. Auditor scope: requirement.md §10.1 acceptance items
**10, 12, 41, 43, 44, 53, 54** (SSE ack/replay/reload, events.jsonl rotation,
inbound idempotency, outbound notify throttling, webhook idempotency, critical
node policy hot reload, SSE replay correctness).

Out of scope (other auditors): P2-A retry / recovery / migrations / task
action routes; P2-B teams / tools internal; web UI.

## Status table

| # | Requirement (1-line) | Status | Notes |
|---|----------------------|--------|-------|
| 10 | Same webhook eventId twice → only one GuardDecision | **MET** | Idempotency on `state/channel-events/<provider>/<eventId>.json`, dup hit short-circuits before guard write. |
| 12 | CriticalNodePolicy CRUD effective without restart | **MET (newly fixed)** | Engine wired into server, `setPolicies(...)` called after every CRUD action. |
| 41 | SSE ack heartbeat + replay + buffer cap + truncated event | **WEAK→MET** | `sse_ack_missing` + `sse_replay_emitted` already wired; `sse_replay_truncated` newly emitted when ring buffer evicts. |
| 43 | `notify_throttled` per (taskId, providerId, target, kind) + global RPM | **WEAK→MET** | Throttle was silent — now writes `notify_throttled` diagnostic file alongside the existing job-failed bookkeeping. |
| 44 | `events.jsonl` rotation at 64MB / 30d threshold | **WEAK** | Atomic rename to `events-archive/<archive-id>.jsonl` is in place; `events_jsonl_rotated` event emission and gzip compression deferred (gap noted). |
| 53 | Inbound (provider, eventId) idempotency, dup → 200 + diagnostic | **MET** | P2-A audit added the diagnostic write at `state/_diagnostics/inbound-duplicates/`. Verified live in `/api/channels/feishu/webhook`. |
| 54 | SSE replay invariant — derived after source | **WEAK** | Causal-ordering chaos test exists for `task_blocked → task_unblocked`; `sse_replay_invariant_violated` detector / counter not yet implemented (gap noted). |

## Per-acceptance detail

### Acceptance 10 — webhook idempotency
- **Code:** `apps/bot-runtime/src/api/routes/channels.ts:152-187`
- **Test:** `apps/bot-runtime/src/retry/__tests__/p2-audit-regressions.test.ts:219` (P2-A coverage).
- **Status:** MET. Same `(provider, eventId)` is short-circuited before any guard / draft work.

### Acceptance 12 — CriticalNodePolicy hot reload
- **Code:** `apps/bot-runtime/src/critical-node/policy-engine.ts:61` (`setPolicies`); `apps/bot-runtime/src/api/routes/policies.ts` (calls `reloadEngine` after each CRUD); `apps/bot-runtime/src/api/server.ts:166-170` (single shared engine seeded from disk and re-loaded after CRUD).
- **Test:** `apps/bot-runtime/src/critical-node/__tests__/policy-hot-reload.test.ts` — POST a new `external_io: require_approval` policy, assert `engine.evaluate(...)` flips from `log_only` → `require_approval` without restart.
- **Status:** MET (newly fixed).
- **Action taken:** wired engine into server bootstrap + reload hook in routes.

### Acceptance 41 — SSE ack / replay / buffer
- **Code:** `apps/bot-runtime/src/runtime/sse/bus.ts` (ring buffer cap 1000 / 2000 with team / 600s age); `apps/bot-runtime/src/runtime/sse/ack-sweeper.ts:21-77` (`sse_ack_missing` + `sse_replay_emitted{reason:"ack_missing"}`); `apps/bot-runtime/src/api/routes/threads.ts:161-189` (ack endpoint).
- **Test:** existing `bus.test.ts`, `ack-sweeper.test.ts`; new `apps/bot-runtime/src/runtime/sse/__tests__/replay-truncated.test.ts` exercises buffer-overflow and max-age eviction → asserts `sse_replay_truncated` envelope reaches the bus tail.
- **Status:** MET (newly fixed). Counters `ai_sse_ack_missing_total` / `ai_sse_replay_emitted_total` are registered in metrics; sweep increments not yet observed by the metrics object (see "Deferred").
- **Action taken:** added `lastTruncation` recording on every eviction, `drainTruncation()` API, and a sweep step in `AckSweeper.sweep()` that publishes the synthetic envelope on the next tick.

### Acceptance 43 — notify_throttled
- **Code:** `apps/bot-runtime/src/retry/notify-throttle.ts` (per-(provider,target,task,kind) bucket + per-provider 30 rpm global ceiling, in-memory only); `apps/bot-runtime/src/channels/job-processor.ts:60-95` (now writes `notify_throttled` diagnostic file when throttle suppresses).
- **Test:** `apps/bot-runtime/src/channels/__tests__/notify-throttle-diagnostic.test.ts` — exhausts the bucket, processes a job, asserts a `state/_diagnostics/notify-throttled/<provider>-<target>.jsonl` file with `kind: notify_throttled, reason: duplicate_retry_window` lands.
- **Status:** MET (newly fixed). Manual-retry reset path is still wired only via `NotifyThrottle.reset(...)`; the call from `task_manual_retry_requested` should be added by P2-A retry path.
- **Action taken:** diagnostic file write inside `OutboundJobProcessor.processOnce`.

### Acceptance 44 — events.jsonl rotation
- **Code:** `apps/bot-runtime/src/runtime/repositories/tasks.ts:33-56` — checks size ≥ `RUNTIME_EVENTS_JSONL_MAX_BYTES` (64MB) or mtime age ≥ `RUNTIME_EVENTS_JSONL_MAX_AGE_DAYS` (30d); on threshold, atomic-rename to `events-archive/<archive-id>.jsonl`; new file restarts empty.
- **Test:** none yet specific to rotation marker (existing `tasks.test.ts` exercises append).
- **Status:** WEAK. Gaps:
  1. No `events_jsonl_rotated` marker is appended to the freshly restarted log (clients lose the breakpoint signal).
  2. No gzip compression of archived file (`<id>.jsonl.gz`) — disk-only.
  3. No `events_jsonl_rotation_failed` emission on failure.
  4. No `events_jsonl_active_size_bytes{taskId}` gauge.
  Counter `ai_events_jsonl_rotated_total` is registered but never `inc()`-ed.
- **Action taken:** **deferred**. An earlier edit added the marker emit + failed branch to `appendEvent`, but a project-level lint pass reverted to the simpler form; respecting that decision per the system reminder. Recommend follow-up RFC to land the marker write + gauge once the lint policy is reconciled.

### Acceptance 53 — channel inbound idempotency
- **Code:** `apps/bot-runtime/src/api/routes/channels.ts:152-187` — `(provider, eventId)` lookup; on duplicate, append a `state/_diagnostics/inbound-duplicates/<provider>-<eventId>.jsonl` record and return `{ ok: true, duplicate: true }` with **no** GuardDecision write.
- **Test:** `apps/bot-runtime/src/retry/__tests__/p2-audit-regressions.test.ts:219` (P2-A audit, kept as the regression target).
- **Status:** MET. Cross-provider isolation handled by the file-path scoping (`<provider>/<externalEventId>.json`).

### Acceptance 54 — SSE replay correctness
- **Code:** `apps/bot-runtime/src/runtime/sse/bus.ts` (per-thread monotonic seq via `appendEvent` sidecar); `apps/bot-runtime/src/runtime/sse/__tests__/causal-ordering.test.ts` chaos test — 20 alternating blocked/unblocked pairs, asserts seq strictly monotonic and pair ordering preserved.
- **Test:** existing `causal-ordering.test.ts` covers the `task_blocked → task_unblocked` invariant.
- **Status:** WEAK. Gaps:
  - No runtime detector emits `sse_replay_invariant_violated` when a violation is observed (counter `sse_replay_invariant_violated_total` also missing).
  - No coverage for `team_completed` after teammate terminal events or `work_item_claimed` after `work_item_published`.
- **Action taken:** **deferred** to P2-B teams audit (team-event causal ordering) + a follow-up to add the detector. Existing chaos test ensures the per-stream seq invariant which is the structural pre-requisite.

## Fix list (this audit)

1. `apps/bot-runtime/src/api/server.ts` — wire shared `CriticalNodePolicyEngine` from disk; expose on `ServerHandle`.
2. `apps/bot-runtime/src/api/routes/policies.ts` — accept optional engine, call `reloadEngine(...)` after every POST/PATCH/DELETE.
3. `apps/bot-runtime/src/runtime/sse/bus.ts` — record buffer/age eviction in `lastTruncation`; expose `drainTruncation()`.
4. `apps/bot-runtime/src/runtime/sse/ack-sweeper.ts` — publish synthetic `sse_replay_truncated` envelope on the next sweep when the bus reports an eviction.
5. `apps/bot-runtime/src/channels/job-processor.ts` — write `notify_throttled` diagnostic record when the throttle suppresses an outbound job.

## Test delta

Added:
- `apps/bot-runtime/src/runtime/sse/__tests__/replay-truncated.test.ts` (3 cases — overflow / age / clean-skip).
- `apps/bot-runtime/src/channels/__tests__/notify-throttle-diagnostic.test.ts` (1 case — throttled job leaves diagnostic).
- `apps/bot-runtime/src/critical-node/__tests__/policy-hot-reload.test.ts` (1 case — POST policy → engine evaluate flips without restart).

Suite delta: 28 files / 126 tests → **35 files / 145 tests**.

## Build / test result

```
pnpm -F @ai-workflow/bot-runtime build  → tsc -b clean
pnpm -F @ai-workflow/bot-runtime test   → 35 passed (35) | 145 passed (145)
```

## Deferred for follow-up

- #44: emit `events_jsonl_rotated` marker + gzip archive + `events_jsonl_active_size_bytes` gauge — earlier inline patch was reverted by project lint policy. Open an RFC to reconcile.
- #41: increment `ai_sse_ack_missing_total` / `ai_sse_replay_emitted_total` / `ai_sse_replay_truncated_total` counters from `AckSweeper` (metrics object exists but no call site yet).
- #54: implement runtime `sse_replay_invariant_violated` detector + counter; extend chaos test to cover team / work-item ordering.
- #43: connect `task_manual_retry_requested` path to `NotifyThrottle.reset({ provider, externalId, taskId })` so user retries clear the per-task window (lives in P2-A retry).
