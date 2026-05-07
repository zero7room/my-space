# Phase 4 Critical Review

**Verdict:** PASS with deferred items. Ready for Phase 5.

## Strengths

- Auth preHandler is global, with per-route exemption for health and webhook.
- Owner-first checks land before any state-modifying I/O.
- SSE bus tests cover replay-after-cap-eviction, since cursor, age eviction, team-uplift cap.
- Single-source-of-truth API paths: routes import `API_ROUTES` from contracts.
- Action endpoints decouple from ThreadLoop via `control.json` signals — keeps Phase 4/5 boundary clean.

## Findings

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| F1 | Important | `loadTask` in routes scans all threads. O(threads*tasks) per request. | Phase 11 will add `_index/`. |
| F2 | Important | SSE bus does not yet implement ack-timeout replay. | Phase 7 implements `sse_ack_missing` event + ack-driven replay. |
| F3 | Important | Webhook route bypasses auth and lacks signature verification. Currently records every inbound event. | Phase 8 wires HMAC signature check. |
| F4 | Minor | `pushControlSignal` for `cancel/pause/resume` does not transition task status; relies on Phase 5 ThreadLoop. Action endpoints return current task state. | Documented. |
| F5 | Minor | `confirmedByUserId` is set on the in-memory `next` task before update, but `applyTaskTransition` does not. Done outside the function then re-validated at write time. | OK; tests cover. |

## Acceptance map (sampled)

- requirement.md §10.1 #4 (only ownerUserId can confirm) — covered, owner-first preHandler + tests.
- §10.1 #6 (client API exposes task/plan/artifacts/events) — full route surface present.
- §10.1 #1 (TaskList only) — none of the routes write a TaskQueue.

## Sign-off

No critical issues. Proceed to Phase 5.