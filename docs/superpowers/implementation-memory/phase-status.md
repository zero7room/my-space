# Phase Status

**Plan:** `docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`
**Started:** 2026-05-06
**Last update:** 2026-05-07

## Current Phase

Phase 7: Retry + Blocked + Notify Throttling + Recovery Hardening — PENDING

## Completed Phases

### Phase 0–5 (summarized above)

### Phase 6: Executor + Tools + Skills + CriticalNodePolicy — 2026-05-07

Verification:
- `pnpm -r build` / `lint` → green
- bot-runtime: 53 tests across 10 files (added 14: critical-node ×6, skills ×4, executor ×4)
- contracts:45, fs-store:27, bot-runtime:53 → 125 unit tests
- `pnpm test:evals` → 1 eval green

Modules:
- `apps/bot-runtime/src/critical-node/policy-engine.ts` — built-in baseline (high-risk skill require_approval), strictness-max resolver (block > require_approval > log_only), all NodeMatcher kinds, hot-reload via `setPolicies`.
- `apps/bot-runtime/src/skills/registry.ts` — SkillRegistry that recurses skill dirs, parses YAML frontmatter, snake→camel mapping, isolates per-skill failures into `skills_load_error` records (field uses snake_case).
- `apps/bot-runtime/src/tools/registry.ts` — ToolRegistry + 6 built-in tools (read_file, write_file, list_dir, str_replace, ask_clarification, present_files) with Zod-validated input + path-safe scoped roots.
- `apps/bot-runtime/src/executor/{executor,model-adapter}.ts` — Executor loop: queued→running, per-step CriticalNodePolicy evaluation (re-evaluated every dispatch), tool dispatch, classify failures (transient/assertion/permission), ask_clarification → blocked. ScriptedAdapter for tests.

## Phase Index

- [x] Phase 0–5 above
- [x] Phase 6: Executor, Runtime Loop, Tools, Skills, CriticalNodePolicy
- [ ] Phase 7: Retry, Blocked Actions, Notify Throttling, Recovery Hardening
- [ ] Phase 6: Executor, Runtime Loop, Tools, Skills, CriticalNodePolicy
- [ ] Phase 7: Retry, Blocked Actions, Notify Throttling, Recovery Hardening
- [ ] Phase 8: Channel Subsystem, Feishu Provider
- [ ] Phase 9: Agent Teams Runtime
- [ ] Phase 10: Web Client Product Surface
- [ ] Phase 11: Observability, Sanitization, Ops, Docs
- [ ] Phase 12: E2E, Agent Evals, CI, Final Acceptance

## Notes

Reference source dirs (`reference/xuedian`, `reference/deer-flow`, `reference/claude-code-analysis`) may be partially unreadable; do not block on them — implement from canonical docs.
