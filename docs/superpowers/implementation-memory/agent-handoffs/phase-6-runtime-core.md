# Phase 6 Handoff — Runtime Core (main session)

**Status:** complete; 14 new tests; suite total 125 + 1 eval.

## Files

- `apps/bot-runtime/src/critical-node/{policy-engine,index}.ts` (+test)
- `apps/bot-runtime/src/skills/{registry,index}.ts` (+test)
- `apps/bot-runtime/src/tools/{registry,index}.ts`
- `apps/bot-runtime/src/executor/{executor,model-adapter,index}.ts` (+test)

## Notable

- CriticalNodePolicyEngine is re-evaluated before every tool dispatch in the loop. Hot reload via `setPolicies(...)` is exercised by tests.
- ToolRegistry validates input via Zod before invoking. `safeRelativePath` translates to `permission_error` for the caller’s failure classifier.
- Executor is deterministic; `ScriptedAdapter` makes the loop testable without an LLM. Real adapters slot into `ModelAdapter`.
- `classifyToolError` recognizes prefix `permission_error:` plus heuristic substrings — Phase 7 retry consumes this.

## Risks for next phases
- No bash tool yet (plan §Phase 6 listed it). Adding bash needs sandboxing decision; deferred.
- Executor does not currently honor pause/cancel signals mid-loop (only between steps would matter). Phase 7 should poll control.json each iteration.
- Skill registry doesn’t persist a fallback snapshot to `_diagnostics/skills-cache.json`. Phase 7 hardening.