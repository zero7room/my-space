# Open Risks

| ID | Risk | Severity | Owner phase | Mitigation |
|----|------|----------|-------------|------------|
| R1 | Eval datasets are seed-sized (10/3/3 vs plan target 200/50/30). | Medium | Phase 12 | Generate full sets pre-release; raise thresholds when full. |
| R2 | `PlanRevisionService` is not transactional across repos. Crash could leave artifacts half-archived. | Medium | Phase 7 | Wrap in fs-store Transactions; recovery already replays committed txs idempotently. |
| R3 | API metrics endpoint is a placeholder. Prom-client + Grafana board are Phase 11. | Low | Phase 11 | Track via plan §Phase 11. |
| R4 | Webhook signature verification not implemented. | High (security) | Phase 8 | Implement HMAC verify before any webhook payload reaches event repo. |
| R5 | ack-timeout-driven SSE replay (`sse_ack_missing`) is not implemented. | Low | Phase 7 | Phase 7 SSE hardening. |
| R6 | `loadTask` route helper scans all threads — O(n*m). | Low | Phase 11 | Add `_index/` lookups. |
| R7 | Sub-agents repeatedly timed out during foundation phases; main session has written code directly. Pace risk for remaining phases (6, 8, 9, 10). | High | self-monitor | Continue direct authorship; stop and report at session boundary if remaining scope can't fit. |
