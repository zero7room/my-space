# Phase Status

**Plan:** `docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`
**Started:** 2026-05-06
**Last update:** 2026-05-07

## Current Phase

Phase 3: Runtime Repositories + Recovery — PENDING

## Completed Phases

### Phase 0: Repository Scaffold — 2026-05-06

- `pnpm install` → ok (252 pkgs)
- `pnpm -r build` / `test` / `lint` → ok

### Phase 1: Contracts, IDs, Schemas, State Machines — 2026-05-07

Verification:
- `pnpm --filter @ai-workflow/contracts build` → ok
- `pnpm --filter @ai-workflow/contracts test` → 45 passed (3 files)
- `pnpm -r build` → all packages build green
- `pnpm -r test` → contracts: 45 pass; others: passWithNoTests
- `pnpm lint` → ok

Modules:
- `packages/contracts/src/ids.ts` — id prefixes, factories, runtimeId regex
- `packages/contracts/src/states.ts` — Task / Plan / Thread / ChannelBinding / Retry / OutboundJob / Team / Teammate / TeamWorkItem state machines
- `packages/contracts/src/schemas.ts` — Zod schemas for every durable record + canTransition* guards + applyTaskTransition
- `packages/contracts/src/events/` — durable event kinds + envelope + SSE frame
- `packages/contracts/src/api/` — API route table + DTO schemas + OWNER_FIRST_ACTIONS
- `packages/contracts/src/sanitize.ts` — sanitizeText() identity stub (Phase 11 hardens)

### Phase 2: Filesystem Store + Transactions — 2026-05-07

Verification:
- `pnpm --filter @ai-workflow/fs-store build` → ok
- `pnpm --filter @ai-workflow/fs-store test` → 27 passed (4 files)
- `pnpm -r build` / `test` / `lint` → green

Modules:
- `errors.ts` — typed errors (PathOutsideRoot, TransactionPreparedOnly, LockNotAcquired, ExclusiveCreateConflict, StaleLease, FsStoreError).
- `paths.ts` — `InstancePaths` covering every path under `data/instances/<runtimeId>/...` from design.md §8 + `safeRelativePath`.
- `primitives.ts` — atomicWriteJson (tmp+fsync+rename+dir-fsync), readJson (sync/async), exclusiveCreateJson (O_CREAT|O_EXCL), appendJsonl, readJsonl (tolerates partial trailing line), atomicRename, sha256File/Stream, listJsonFilesSorted, listSubdirsSorted, removeIfExists, cleanupTmpOrphans.
- `keyed-mutex.ts` — in-process per-key mutex.
- `jsonl.ts` — appendEvent (auto-assigns monotonic seq + event id) + readEventsSince.
- `transactions.ts` — Transactions class with prepare/commit/rollback/recover. Operations: write, append, rename, delete. Recovery rolls back prepared, replays committed (idempotent), leaves rolledback.
- `locks.ts` — acquireInstanceLock (O_CREAT|O_EXCL with stale-detection rename to `*.stale.<token>`), refreshInstanceLock, releaseInstanceLock, LeaseManager.

Deferred: instance-level recovery scan composition (Phase 3).

## Phase Index

- [x] Phase 0: Repository Scaffold
- [x] Phase 1: Contracts, IDs, Schemas, State Machines
- [x] Phase 2: Filesystem Store, Transactions
- [ ] Phase 3: Runtime Repositories, Recovery Scan
- [ ] Phase 4: Fastify API, Auth, SSE
- [ ] Phase 5: ThreadLoop, MessageGuard, Task Confirmation, Plan Revision
- [ ] Phase 6: Executor, Runtime Loop, Tools, Skills, CriticalNodePolicy
- [ ] Phase 7: Retry, Blocked Actions, Notify Throttling, Recovery Hardening
- [ ] Phase 8: Channel Subsystem, Feishu Provider
- [ ] Phase 9: Agent Teams Runtime
- [ ] Phase 10: Web Client Product Surface
- [ ] Phase 11: Observability, Sanitization, Ops, Docs
- [ ] Phase 12: E2E, Agent Evals, CI, Final Acceptance

## Notes

Reference source dirs (`reference/xuedian`, `reference/deer-flow`, `reference/claude-code-analysis`) may be partially unreadable; do not block on them — implement from canonical docs.
