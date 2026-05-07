# Phase 5 Handoff — ThreadLoop / Runtime Core

**Status:** complete; 14 new tests + 1 eval; full suite 111 + 1.

## Files added
- `apps/bot-runtime/src/thread-loop/{message-guard,thread-loop,task-drafts,plan-revisions,index}.ts`
- `apps/bot-runtime/src/evals/{harness,index}.ts`
- `tests/evals/datasets/*.jsonl`

## Behavior
- ThreadLoop is pull-style (`runOnce(threadId, taskId)`); Phase 6 Executor / Phase 11 worker can wrap it.
- Task action endpoints in Phase 4 already push `pendingSignals`; ThreadLoop drains them and emits one of: `task_cancelled`, `task_paused`, `task_resumed`, `task_manual_retry_requested`, `plan_step_skipped`, `tool_call_approved`, `plan_revising`, or `task_state_transition_blocked` on illegal transitions.
- TaskDraftService.confirmTask is the only path that appends to TaskList. Non-owner confirm throws — never reaches TaskList.
- PlanRevisionService is transactional in spirit (sequence of repo writes); a future hardening pass should wrap in fs-store `Transactions` for crash safety.

## Risks
- ThreadLoop drains all signals atomically per call; if a transition fails mid-batch, earlier transitions persist. Acceptable for v1 because each signal effect is independent.
- Plan revision still triggers via the API’s revise signal — but actual confirmation/rejection of the revised plan is left to ThreadLoop in a later phase.