# Phase 2 Handoff — Runtime Core (main session)

**Status:** complete. fs-store green: 27 tests across 4 files.

## Files added

- `packages/fs-store/src/errors.ts`
- `packages/fs-store/src/paths.ts` — `InstancePaths` covering all paths in design.md §8.
- `packages/fs-store/src/primitives.ts` — atomic write/read, jsonl append/read, exclusive create, sha256, list helpers, tmp-orphan cleanup.
- `packages/fs-store/src/keyed-mutex.ts`
- `packages/fs-store/src/jsonl.ts` — `appendEvent` auto-assigns monotonic seq+id.
- `packages/fs-store/src/transactions.ts` — Transactions class with prepare/commit/rollback/recover, ops {write, append, rename, delete}.
- `packages/fs-store/src/locks.ts` — `acquireInstanceLock` with stale rename, `refreshInstanceLock`, `releaseInstanceLock`, `LeaseManager`.
- Tests in `src/__tests__/`.

## Notes for Phase 3

- Repositories should layer on top of `InstancePaths` and `Transactions`. Use `appendEvent` for events.jsonl, and use the keyed mutex per-task / per-thread when serializing multi-file mutations not protected by Transactions.
- `Transactions.recover()` only handles `_transactions/` content. Phase 3 should compose it with: instance-lock acquisition, tmp-orphan cleanup, lease expiry, and `task-list.json` repair.
- `appendEvent` writes a `<log>.seq.json` sidecar. Recovery scan should rebuild this sidecar if missing by reading the log.

## Risks

- Append-op idempotency on transaction replay relies on event-id deduplication downstream. Document in Phase 6 when the executor wires event emission.
- Directory fsync is best-effort and silently swallowed on platforms that don't allow it. Acceptable for v1 per design §10.