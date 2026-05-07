# Phase 6 Critical Review

PASS with deferrals.

## Strengths
- Built-in policy enforces high-risk-skill require_approval as the floor.
- Tool path-safety: writes constrained to workspace/outputs roots; PathOutsideRoot maps to permission_error.
- Failure classifier recognizes transient/assertion/permission and emits `failureClass` on `tool_call_failed`.
- Executor emits structured events for every state transition: tool_call_started/completed/failed, blocked_by_critical_node, task_started/completed/blocked.

## Findings
| # | Sev | Finding | Action |
|---|-----|---------|--------|
| F1 | Important | No `bash` tool. CriticalNodePolicy bash matchers won't have a target until Phase 7 or later adds it. | Track in open-risks. |
| F2 | Important | Executor doesn't poll control.json pendingSignals between steps; cancel/pause won't preempt mid-loop. | Phase 7. |
| F3 | Minor | Skill registry has no fallback to `_diagnostics/skills-cache.json` after repeated boot failures. | Phase 7 hardening. |
| F4 | Minor | failureClass heuristic in `classifyToolError` is regex-based; Phase 11 should observe accuracy via the eval harness. | Tracked. |

## Acceptance map (sampled)
- requirement.md §10.1 #12 (CriticalNodePolicy applied without restart) — `setPolicies` hot-reload + per-dispatch evaluate path tested.
- §10.1 #20 (skill manifest validation isolated, error surfaces field) — covered by tests.

## Sign-off
Proceed to Phase 7.