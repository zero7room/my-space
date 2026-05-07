# Phase 3 Critical Review

**Verdict:** PASS. Ready for Phase 4.

## Strengths

- Repositories thin and uniform — every write validates against the contract schema; reads validate too.
- TaskList recovery is conservative: rebuild from `tasks/<taskId>/task.json` filtering by `confirmedByUserId`, ordered by `createdAt`. No reordering on retry.
- Stale `running` tasks transition to `blocked{non_idempotent_tool_in_flight}` instead of auto-retry — matches design.md §17.3.
- `ChatClaim` uniqueness via O_EXCL guards the cross-thread provider+chat invariant.
- Recovery emits structured events (transaction_pending_dropped, task_state_transition, task_blocked, task_list_repair, team_failed, team_cancelled) with timestamps and writes them to `_diagnostics/recovery.jsonl`.

## Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| F1 | Important | Recovery does not currently fence in-flight `_message-seq` per team — Phase 9 must replay messages.jsonl + bump seq during team boot. | Tracked in Phase 9 plan. |
| F2 | Important | Recovery's `RecoveryScanner.run` uses `Date.now()` directly for the retry-scheduler stale check rather than the injected clock. | Phase 7 hardening will inject clock everywhere. |
| F3 | Minor | When recreating a missing TaskList during repair, the placeholder id `tl_<21 zeros>` would fail prefix uniqueness if multiple repairs landed. Should call `newTaskListId()`. | Trivial follow-up. |
| F4 | Minor | `ThreadRepository.appendGuardDecision` returns the augmented value as `GuardDecision & { seq }` but downstream consumers should not rely on that shape. | OK — only test consumes. |
| F5 | Minor | `ChannelEventRepository.record` writes by `externalEventId`; subsequent identical inbound webhook updates would silently replace. | Phase 8 should turn this into idempotent first-write-wins. |

## Acceptance map (sampled)

- requirement.md §10.1 #9 (restart preserves task/plan/transcript/artifact) — repos round-trip; recovery scan validates; plus tests.
- §10.1 #11 (confirmed task recovers within 60s after crash) — recovery tested end-to-end (migrate + repair + block stale).
- §10.1 #5 (durable multi-file mutations use transactions) — mechanics in fs-store, repos use atomicWriteJson + would use Transactions for multi-file ops; Phase 4/5/6 wire this end-to-end.

## Sign-off

No critical issues. Proceed to Phase 4.