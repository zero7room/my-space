# Runbook: Bot Runtime Operations

## Boot sequence

1. Acquire `data/instances/<runtimeId>/.lock` via `O_CREAT|O_EXCL`. If a stale
   lock is present (`leaseExpireAt` in the past), it is renamed to
   `.lock.stale.<oldFencingToken>` and reclaimed. Auditable evidence is
   preserved — never delete `.stale.*` files manually.
2. `RecoveryScanner.run()` cleans tmp orphans, replays/rolls back transactions,
   migrates schemaVersion 1 → 2 tasks, blocks stale running tasks, repairs
   `task-list.json`, requeues locked outbound jobs, expires retry-scheduler
   lock if past lease, and reconciles team status (forming with no teammates →
   cancelled; finishing without summary → failed).
3. Fastify mounts auth + routes; SSE buses are constructed lazily per thread.

## Common operator actions

### Force unblock a running task on a dead runtime

If a runtime crashed with running tasks:
1. Confirm the runtime is not coming back (`.lock` `leaseExpireAt` past).
2. Start a new runtime; recovery transitions running → blocked
   (`non_idempotent_tool_in_flight`).
3. Operator decides per task:
   - Resume safely → owner POSTs `/api/tasks/:id/resume` (re-queues).
   - Permanent failure → owner POSTs `/api/tasks/:id/cancel`.

### Inspect transactions that were rolled back

`grep transaction_pending_dropped data/instances/<runtimeId>/state/_diagnostics/recovery.jsonl`

### Retry a failed task manually

Owner-only: POST `/api/tasks/:id/retry`. Resets `attemptCount` to 0 and
transitions `failed → queued` via the manualRetry path.

### Reset a failed task via plan update

Owner-only: POST `/api/tasks/:id/plans/:revisionId/confirm` after a
PlanRevision is created. This both supersedes the old plan and resets
`TaskRetryState` (clears `failureClass` / `nextRetryAt`).

## SSE replay

The client reconnects with `?since=<lastSeq>`. The server's per-thread ring
buffer holds up to 1000 events (2000 when a team is active) and drops events
older than 600 s.

## Outbound channel job pipeline

Files move atomically through `state/jobs/{pending,locked,done,failed}/`. A
job marked `dead` was retried up to `maxAttempts` (default 5).
`dedupeKey` collisions short-circuit to `done` to prevent double-send.

## Throttle behavior

Per-conversation token bucket (default 5 / 60 s). When exceeded, the job
fails with `lastError=channel_notify_throttled` instead of dispatching.

## When in doubt

- `data/instances/<runtimeId>/state/_diagnostics/recovery.jsonl` — boot history.
- `data/instances/<runtimeId>/state/_transactions/` — every multi-file mutation.
- `data/instances/<runtimeId>/state/threads/<id>/tasks/<id>/events.jsonl` — full
  task narrative.
