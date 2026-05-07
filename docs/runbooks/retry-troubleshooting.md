# Retry & Recovery Troubleshooting Runbook

This runbook covers oncall response for the retry / recovery subsystem of the AI workflow runtime.
Each SOP is designed to be reproducible and mitigated within **15 minutes** by a single oncall.

- Metrics endpoint: `http://<runtime-host>:9464/metrics` (Prometheus exposition).
- Diagnostics path: `data/instances/<runtimeId>/state/_diagnostics/recovery.jsonl`
- Lock file: `data/instances/<runtimeId>/state/_locks/retry-scheduler.lock`
- Task event log: `data/instances/<runtimeId>/tasks/<taskId>/events.jsonl`
- Escalation channel: `#ai-workflow-incidents` — primary contact `@ai-workflow-oncall`.

> Convention: all `grep`/`cat` commands assume `RUNTIME_DATA=/var/lib/ai-workflow/data/instances/<runtimeId>` is exported.

---

## SOP-1: retry 风暴 (transient_error retry storm)

### Signal
- Metric: `task_retry_scheduled_total{failureClass="transient_error"}`
- Alert threshold: 5-minute averaged rate `> 10/min`
  - PromQL: `avg_over_time(rate(task_retry_scheduled_total{failureClass="transient_error"}[1m])[5m:1m]) * 60 > 10`

### Hypothesis
A burst of retries scheduled with `failureClass=transient_error` indicates a downstream dependency is flaky or saturated.
Common causes:
- LLM provider 429 / 5xx surge.
- Network / DNS instability between runtime and provider.
- Circuit breaker mis-tuned (tripping but not opening).
- A single tenant emitting a runaway loop of failing tool calls.

### Diagnose
1. Prometheus query (rate per minute, broken down by tenant if labelled):
   ```promql
   sum by (failureClass, tenantId) (rate(task_retry_scheduled_total[1m])) * 60
   ```
2. Filesystem grep — find the offending tasks in the recovery log:
   ```bash
   grep -E '"failureClass":"transient_error"' \
     "$RUNTIME_DATA/state/_diagnostics/recovery.jsonl" | tail -100 | jq -r '.taskId' | sort | uniq -c | sort -rn | head
   ```
3. Inspect the scheduler lock to confirm a single live owner is processing the storm (not a split-brain):
   ```bash
   cat "$RUNTIME_DATA/state/_locks/retry-scheduler.lock"
   ```
   Fields: `owner` (host:pid), `acquiredAt` (ISO timestamp), `heartbeatAt` (must be <30s old), `token` (UUID), `epoch` (monotonic).
   - Confirm one fresh owner; multiple owners or stale heartbeat is a different SOP (see SOP-2).

### Mitigate
1. Identify the failing dependency (provider name in the recovery log).
2. **Runtime-side:** trigger a graceful retry suppression for the offending tenant via the owner endpoint:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/retry/suspend" \
     -H 'content-type: application/json' \
     -d '{"tenantId":"<tenant>","durationSec":300,"reason":"SOP-1 storm"}'
   ```
   If a single dependency is at fault, prefer a graceful master restart with backoff multiplier env override:
   ```bash
   RETRY_BACKOFF_MULTIPLIER=2.0 systemctl restart ai-workflow-runtime
   ```
3. **Filesystem check:** if a poisoned task keeps re-arming, rename (do **not** unlink) its retry envelope to take it out of rotation while preserving audit:
   ```bash
   mv "$RUNTIME_DATA/tasks/<taskId>/retry.envelope.json" \
      "$RUNTIME_DATA/tasks/<taskId>/retry.envelope.json.quarantine.$(date -u +%Y%m%dT%H%M%SZ)"
   ```
   Safety: never `unlink` retry envelopes — they are required for audit and post-incident replay.

### Escalation
- If rate has not dropped below 10/min within 10 minutes after mitigate, escalate.
- Contact: `@ai-workflow-oncall` in `#ai-workflow-incidents`. Page provider-integration team if the upstream dependency is implicated.

---

## SOP-2: lock stale 累积 (retry scheduler lock stale-file buildup)

### Signal
- Metric: `retry_scheduler_lock_stale_files`
- Alert threshold: gauge `> 5` for 5m.

### Hypothesis
The retry scheduler renames stale lock files to `retry-scheduler.lock.stale.<token>` when it detects an expired owner.
Accumulation indicates either repeated crash-without-cleanup loops, or a janitor / GC path is broken.
Common causes:
- Master process is OOM-looping (kill-9 path, see also SOP-5).
- Filesystem clock skew making heartbeats look stale prematurely.
- A bug in the stale-lock GC (not deleting after audit window).
- Disk full or readonly preventing rename / unlink.

### Diagnose
1. Prometheus:
   ```promql
   retry_scheduler_lock_stale_files
   sum(increase(retry_scheduler_lock_stolen_total[1h]))
   ```
2. Filesystem grep — list stale files and group by epoch:
   ```bash
   ls -la "$RUNTIME_DATA/state/_locks/" | grep '\.stale\.'
   grep -E '"event":"lock\.stale"' "$RUNTIME_DATA/state/_diagnostics/recovery.jsonl" | tail -50
   ```
3. Inspect the live lock to confirm current owner is healthy:
   ```bash
   cat "$RUNTIME_DATA/state/_locks/retry-scheduler.lock"
   ```
   Fields recap: `owner`, `acquiredAt`, `heartbeatAt`, `token`, `epoch`. `heartbeatAt` newer than `now-30s` means the live owner is fine; the stale files are historical residue.

### Mitigate
1. **Runtime-side:** trigger the janitor sweep via the owner admin endpoint:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/retry/sweep-stale-locks" \
     -H 'content-type: application/json' -d '{"olderThanSec":3600}'
   ```
   If the janitor is broken, perform a graceful master restart so the bootstrap stale-lock pass can run:
   ```bash
   systemctl restart ai-workflow-runtime
   ```
2. **Filesystem check:** if a particular stale file blocks acquisition, do not `unlink` — rename to `.archived` to preserve audit:
   ```bash
   for f in "$RUNTIME_DATA"/state/_locks/retry-scheduler.lock.stale.*; do
     mv "$f" "${f/.stale./.archived.}"
   done
   ```
   Safety: never `rm` lock files; we keep them for `kill-9` postmortem in SOP-5.

### Escalation
- If gauge does not drop below 5 within 10 minutes, escalate.
- Contact: `@ai-workflow-oncall` in `#ai-workflow-incidents`. Loop in storage / SRE if disk-full is suspected.

---

## SOP-3: schema migration 失败 (task schema migration failure)

### Signal
- Metric: `task_schema_migration_failed_total`
- Alert threshold: any non-zero increment — page immediately.
  - PromQL: `increase(task_schema_migration_failed_total[5m]) > 0`

### Hypothesis
A task envelope on disk failed to upgrade to the current schema version on read.
Common causes:
- Code ship missing a migration step for an older schema version.
- A corrupted task file (truncated JSON, wrong magic).
- Forward-incompatible field introduced without bump.
- Disk read error / permission flip.

### Diagnose
1. Prometheus:
   ```promql
   sum by (errorClass, fromVersion, toVersion) (increase(task_schema_migration_failed_total[1h]))
   ```
2. Filesystem grep — pinpoint affected tasks and see the original payload:
   ```bash
   grep -E '"event":"schema\.migration\.failed"' "$RUNTIME_DATA/state/_diagnostics/recovery.jsonl" \
     | tail -20 | jq -r '.taskId, .errorClass, .fromVersion, .toVersion'
   for tid in $(grep -E '"event":"schema\.migration\.failed"' "$RUNTIME_DATA/state/_diagnostics/recovery.jsonl" | tail -20 | jq -r '.taskId'); do
     ls -la "$RUNTIME_DATA/tasks/$tid/"
   done
   ```
3. Check the lock to make sure the migration owner is the expected one (avoid double-migration race):
   ```bash
   cat "$RUNTIME_DATA/state/_locks/retry-scheduler.lock"
   ```
   `owner` should be the same host running the new code; if mixed-version owners are taking turns, freeze deploys.

### Mitigate
1. **Runtime-side:** roll the runtime back to the previous version if the failed migration was introduced by the latest deploy:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/migration/pause"
   systemctl restart ai-workflow-runtime@previous
   ```
   Otherwise, if it is a single corrupted file, use the targeted requeue endpoint:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/tasks/<taskId>/recover" \
     -d '{"strategy":"reload-from-events"}'
   ```
2. **Filesystem check:** quarantine the broken envelope (rename, never delete):
   ```bash
   mv "$RUNTIME_DATA/tasks/<taskId>/task.json" \
      "$RUNTIME_DATA/tasks/<taskId>/task.json.broken.$(date -u +%Y%m%dT%H%M%SZ)"
   ```
   Safety: never `rm` or hand-edit `task.json`; the events log is the source of truth and must be preserved alongside the broken file for forensics.

### Escalation
- Page immediately on first occurrence — schema corruption is data-loss adjacent.
- Contact: `@ai-workflow-oncall` in `#ai-workflow-incidents`; loop in `@ai-workflow-platform` (data team) for schema rollback decision.

---

## SOP-4: classification 误判风暴 (classification warning surge)

### Signal
- Metric: `task_retry_classification_warning_total`
- Alert threshold: short-window rate increase, e.g. 5x over 5m baseline.
  - PromQL: `sum(rate(task_retry_classification_warning_total[5m])) > 5 * sum(rate(task_retry_classification_warning_total[1h] offset 1h))`

### Hypothesis
The classifier is emitting warnings — either falling back to the heuristic path or downgrading a `permanent_error` to `transient_error`.
Common causes:
- LLM classifier prompt regressed (prompt-eval drift).
- Provider returning malformed structured output.
- A new error string the heuristic doesn't recognise (defaulted to UNKNOWN).
- Tenant suddenly emitting a novel error pattern (often follows a SOP-1 storm).

### Diagnose
1. Prometheus, broken down by warning class:
   ```promql
   sum by (warningClass) (rate(task_retry_classification_warning_total[5m]))
   ```
2. Filesystem grep — surface the actual warning payloads:
   ```bash
   grep -E '"event":"retry\.classify\.warn"' "$RUNTIME_DATA/state/_diagnostics/recovery.jsonl" \
     | tail -50 | jq -r '.warningClass, .reasonSample' | sort | uniq -c | sort -rn
   ```
3. Confirm a single owner is doing classification (split-brain would double-count warnings):
   ```bash
   cat "$RUNTIME_DATA/state/_locks/retry-scheduler.lock"
   ```
   If `epoch` has changed multiple times in the last 5 minutes, stop here and treat as SOP-2.

### Mitigate
1. **Runtime-side:** force the classifier into the heuristic-only path while you investigate the LLM regression:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/classifier/mode" \
     -H 'content-type: application/json' -d '{"mode":"heuristic-only"}'
   ```
   Or perform a graceful master restart with the env override:
   ```bash
   RETRY_CLASSIFIER_MODE=heuristic systemctl restart ai-workflow-runtime
   ```
2. **Filesystem check:** rename a captured offending sample for offline replay (do not delete):
   ```bash
   mv "$RUNTIME_DATA/state/_diagnostics/classifier-sample.jsonl" \
      "$RUNTIME_DATA/state/_diagnostics/classifier-sample.jsonl.snapshot.$(date -u +%Y%m%dT%H%M%SZ)"
   ```
   Safety: keep the snapshot — it is the only reproducer for the classifier eval suite.

### Escalation
- If warnings persist above the baseline 15 minutes after switching to heuristic mode, escalate.
- Contact: `@ai-workflow-oncall` in `#ai-workflow-incidents`; tag `@ai-workflow-evals` for prompt regression triage.

---

## SOP-5: kill-9 retry recovery 路径阻塞 (kill-9 recovery blocked)

### Signal
- Metrics:
  - `retry_scheduler_replay_corrected_total` (anomalous spike or zero when replays are expected)
  - `retry_scheduler_lag_ms > 30000`
- Alert threshold: lag gauge above 30s for 5m, especially combined with non-zero `replay_corrected`.
  - PromQL:
    ```promql
    retry_scheduler_lag_ms > 30000
    and on() increase(retry_scheduler_replay_corrected_total[10m]) > 0
    ```

### Hypothesis
The previous master was killed with SIGKILL, leaving in-flight retries un-acked. A successor master is replaying the WAL but is stuck.
Common causes:
- Stale lock blocking the new master's takeover (overlap with SOP-2).
- WAL contains a poison record that the replay loop cannot apply.
- Successor master is throttled by I/O / GC.
- Clock skew making `expectedRunAt` look in the far future.

### Diagnose
1. Prometheus:
   ```promql
   retry_scheduler_lag_ms
   increase(retry_scheduler_replay_corrected_total[10m])
   sum by (cause) (rate(retry_scheduler_lock_reclaimed_total[5m]))
   ```
2. Filesystem grep — find the replay cursor and the last successful apply:
   ```bash
   grep -E '"event":"retry\.replay\.(start|stuck|corrected)"' \
     "$RUNTIME_DATA/state/_diagnostics/recovery.jsonl" | tail -30
   tail -5 "$RUNTIME_DATA/state/retry-scheduler.wal"
   ```
3. Inspect the lock — for kill-9 cases the previous `token` should differ from the current `token`, and the new owner's `epoch` must be greater:
   ```bash
   cat "$RUNTIME_DATA/state/_locks/retry-scheduler.lock"
   ls -la "$RUNTIME_DATA/state/_locks/" | grep '\.stale\.'
   ```
   Fields: confirm `epoch` strictly increases across stale → live lock; `acquiredAt` of the live lock should be after the last stale `heartbeatAt`.

### Mitigate
1. **Runtime-side:** kick the replay loop via the admin endpoint:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/retry/replay/resume" \
     -H 'content-type: application/json' -d '{"skipPoisonRecord":false}'
   ```
   If lag does not budge within 2 minutes, do a graceful master restart so a fresh master takes the lock with a clean WAL cursor:
   ```bash
   systemctl restart ai-workflow-runtime
   ```
   Only as a last resort, allow a single poison record to be skipped:
   ```bash
   curl -X POST "http://<runtime-host>:8080/admin/retry/replay/resume" \
     -d '{"skipPoisonRecord":true,"reason":"SOP-5 last-resort"}'
   ```
2. **Filesystem check:** if a stale lock is blocking takeover, rename it (do not unlink) so audit is preserved while the new master can claim:
   ```bash
   for f in "$RUNTIME_DATA"/state/_locks/retry-scheduler.lock.stale.*; do
     mv "$f" "${f/.stale./.kill9.$(date -u +%Y%m%dT%H%M%SZ).}"
   done
   ```
   Safety: never `unlink` — the stale lock token is part of the kill-9 forensic trail.

### Escalation
- If `retry_scheduler_lag_ms` remains above 30000 ms after both mitigation steps (10 minutes total), escalate.
- Contact: `@ai-workflow-oncall` in `#ai-workflow-incidents`; for poison-record skips, tag `@ai-workflow-platform` for postmortem ownership.

---

## CI executable verification

The CI smoke test in `tests/runbook-smoke/retry.test.ts` asserts that all 5 SOP titles and the 5 mandated subsections (`Signal`, `Hypothesis`, `Diagnose`, `Mitigate`, `Escalation`) are present. Future fault-injection harnesses extend the smoke test by mocking the corresponding metric and asserting the runbook's diagnose query yields the expected direction.
