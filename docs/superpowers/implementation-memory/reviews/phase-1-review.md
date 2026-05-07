# Phase 1 Critical Review

**Verdict:** PASS. Ready for Phase 2.

## Strengths

- Single source of truth for IDs, state machines, schemas, events, and API
  routes; nothing duplicated in apps yet.
- `applyTaskTransition` enforces blockedReason at the type level via the
  context-aware guard rather than only at schema validation time.
- Schema strictness rejects unknown fields, which catches typos at the
  durable-write boundary.

## Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| R1 | Important | `taskRetryStateSchema` allows `attemptCount === maxRetries + 1` to leave room for the in-flight retry. Recovery scan must close this when a task transitions out of `running`. | Track in Phase 7. |
| R2 | Minor | `idString` regex accepts any letter-prefix; misuse won't be caught at schema layer. | Repositories enforce prefix. |
| R3 | Minor | `THREAD_TRANSITIONS` is permissive (every non-self edge legal). Real invariants live in ThreadLoop (Phase 5). | Documented in handoff. |
| R4 | Minor | `taskBaseSchema` exposed alongside `taskSchema`. DTOs must use `.extend(taskBaseSchema)` and re-run `taskSchema.parse` at write time. | Documented. |
| R5 | Minor | `policyListResponseSchema.policies` is the canonical wire shape. Web client must not invent a different one. | Phase 10 reminder. |

## Acceptance map (sampled)

- requirement.md §10.1 #1 (TaskList is single ordered durable collection) → covered by `taskListSchema`; no `TaskQueue` schema added.
- §10.1 #4 (only ownerUserId can confirm) → enforced via Task refine + OWNER_FIRST_ACTIONS list.
- §10.1 #19 (`completed` not `done` for TeamWorkItem) → covered by `teamWorkItemStatusSchema` + dedicated regression test.

## Sign-off

No critical issues. Proceed to Phase 2.
