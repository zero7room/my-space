# Phase 3 Handoff — Runtime Core (main session)

**Status:** complete. 14 new tests; full suite 86 tests across 9 files.

## Files added

- `apps/bot-runtime/src/runtime/repositories/{types,runtime-info,users,threads,tasks,plans,artifacts,channels,policies,teams,index}.ts`
- `apps/bot-runtime/src/runtime/paths.ts` — RuntimePaths bag.
- `apps/bot-runtime/src/runtime/migrations/task-retry-state.ts`
- `apps/bot-runtime/src/runtime/recovery.ts`
- `apps/bot-runtime/src/runtime/__tests__/repositories.test.ts`
- `apps/bot-runtime/src/runtime/__tests__/recovery.test.ts`

## Notable design

- All repositories validate via Zod schemas before atomicWriteJson.
- `ThreadRepository.appendGuardDecision` strips the `kind`/`seq` sidecar from the GuardDecision shape before validating on read.
- `TaskRepository.appendEvent` uses `appendEvent` from fs-store which auto-assigns monotonic seq via `<log>.seq.json` and `id` via `newEventId()`.
- `ChannelBindingRepository.claimExternalChat` uses fs-store's `exclusiveCreateJson` so duplicate claims fail loudly.
- `ChannelJobRepository.move` uses atomic rename across `pending|locked|done|failed` buckets — the canonical durable workflow.
- `RecoveryScanner.run` returns a `RecoveryReport` and writes the same events to `state/_diagnostics/recovery.jsonl`. Phase 4 health endpoint can read this.

## Risks for next phases

- Phase 4 must wire `acquireInstanceLock` before starting Fastify, and call `RecoveryScanner.run` during the boot sequence.
- Recovery's stale-running-task block uses `non_idempotent_tool_in_flight` reason; Phase 7 retry policy must treat this as user-actionable, not auto-retried.
- `thread.activeTaskId` is not currently rebuilt by recovery — Phase 5 ThreadLoop must derive it from active tasks on boot.
- `TaskList.id` placeholder used when creating a missing TaskList in recovery — replace with proper id factory if surfaced.

## Next agent

Phase 4: Fastify API, bearer auth, SSE foundation. Wires `RuntimePaths`, `RecoveryScanner`, and `acquireInstanceLock` into a startup sequence.