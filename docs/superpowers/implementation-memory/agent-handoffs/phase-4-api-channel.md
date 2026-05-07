# Phase 4 Handoff — API/Channel Agent (main session)

**Status:** complete. 11 new tests; suite total 97 across 11 files.

## Files added

- `apps/bot-runtime/src/auth/user-token.ts`
- `apps/bot-runtime/src/runtime/sse/{bus,index}.ts`
- `apps/bot-runtime/src/runtime/sse/__tests__/bus.test.ts`
- `apps/bot-runtime/src/api/server.ts`
- `apps/bot-runtime/src/api/routes/{health,users,threads,tasks,artifacts,channels,policies,skills,teams}.ts`
- `apps/bot-runtime/src/api/__tests__/server.test.ts`
- bot-runtime entry rewritten to boot the Fastify server.

## Notable design

- Boot order: `acquireInstanceLock` → `RecoveryScanner.run` → register routes. Closing releases the lock.
- Owner-first auth: `req.auth` set in preHandler from bearer token. Routes that touch `Task`/`Thread`/`Team`/`Policy` always check `req.auth.user.id === resource.ownerUserId`.
- Cross-phase action endpoints (`/confirm`, `/retry`, `/skip`, `/pause`, `/resume`, `/cancel`, `/critical-node/*`, plan-revision confirm/reject) write a `pendingSignals` entry in `control.json` so Phase 5 ThreadLoop can drain them. `/confirm` is fully implemented in this phase since it does not require ThreadLoop.
- `GET /api/threads/:id/events` uses the `ThreadEventBus` to stream SSE with replay via `since=<seq>` query.
- `feishu/webhook` records inbound but does not validate signatures yet (Phase 8).
- `LOCAL_USER_TOKENS` parser drops malformed pairs silently. Token hint is used in audit logs (`tokenHint('alice-dev-token')` → `'ali***ken'`).

## Known gaps for next phases

- ThreadEventBus is in-process. Phase 5/6 must call `sse.publish` whenever events are appended via repos so subscribers see them. Current routes that write events do publish, but Phase 5+ writers must also.
- `loadTask` in tasks/teams routes scans all threads; replace with `_index/` lookup in Phase 11.
- ack endpoint is a noop ack. Plan §Phase 4 Step 3 requires ack-timeout-driven replay; deferred to Phase 7 hardening.
- prom-client metrics endpoint returns a placeholder.

## Risks

- Fastify `disableRequestLogging: false` → ensure secrets stay redacted (currently authorization is). Add Feishu `x-lark-request-signature` to redact list in Phase 8.
- `applyTaskTransition` reused for confirm. The transition target `confirmed` requires `confirmedByUserId` to equal `ownerUserId` (validated at write time by `taskSchema.refine`). Confirmed; tested.