# Phase 1 Handoff — Runtime Core (main session)

**Status:** complete. `pnpm -r build && pnpm -r test && pnpm lint` green.

## Files added / modified

- `packages/contracts/src/ids.ts` — prefix table + factories.
- `packages/contracts/src/states.ts` — state machines (added `unknown` cast on
  THREAD_TRANSITIONS Object.fromEntries result).
- `packages/contracts/src/schemas.ts` — durable record Zod schemas; split
  `taskBaseSchema` (raw object) and `taskSchema` (with refines) so DTOs can
  `.extend`. Added `canTransition*` and `applyTaskTransition` here per Phase 1
  Step 4.
- `packages/contracts/src/sanitize.ts` — identity stub.
- `packages/contracts/src/events/{kinds.ts,schemas.ts,index.ts}` — event kinds,
  EventEnvelope, SseFrame.
- `packages/contracts/src/api/{routes.ts,schemas.ts,index.ts}` — route table,
  DTOs, OWNER_FIRST_ACTIONS.
- `packages/contracts/src/__tests__/{ids,states,schemas}.test.ts` — 45 tests.
- `packages/contracts/src/index.ts` — barrel.

## Tests added

- ID format/prefix round-trip and runtimeId regex (5).
- State machine transition tables — every legal edge + selected illegal +
  self-rejection — for Task/Plan/TeamWorkItem/Team/Teammate (13).
- Schema happy-path + per-required-field-missing negatives + enum-out-of-range
  for TaskList, ChangeRecord, ArtifactRecord, SkillManifest, Task,
  TaskRetryState, Team, TeamRosterSlot, TeamWorkItem, TeamMessage, Teammate
  (27).

## Notable decisions

1. `taskBaseSchema` vs `taskSchema`: refines turn the schema into ZodEffects,
   which has no `.extend`. Phase 4 / Phase 10 should `.extend` `taskBaseSchema`
   when shaping DTOs and validate the strict invariants via `taskSchema` at
   write time.
2. `idString` is unprefixed — the regex only matches `<lowerletters>_<21 chars>`.
   Per-prefix narrowing happens in repositories that need it.
3. `ChannelConfigView.hasSecret` is `Record<string, boolean>` so the API can
   surface "secret X is set" without leaking content.
4. `OWNER_FIRST_ACTIONS` is a string-key list; the API layer (Phase 4) wires it
   to the auth middleware. Don't duplicate the list elsewhere.

## Risks for next phases

- `taskRetryStateSchema` enforces `attemptCount <= maxRetries + 1`; runtime must
  refresh `lastFailureReason` before re-validating, otherwise the schema may
  reject a legitimate "currently attempting" intermediate state.
- `THREAD_TRANSITIONS` is permissive (any non-self-edge allowed). The runtime
  layer must keep a higher-level invariant: thread state derives from active
  task state. Don't loosen at the schema layer — tighten in ThreadLoop.

## Next agent

Phase 2: Filesystem Store. Implement atomic write, append-only JSONL, file lock
with stale detection, transactions under `state/_transactions/`, lease primitive.
Build on `packages/fs-store/src` and add unit tests.
