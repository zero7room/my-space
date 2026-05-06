# Architectural Decisions

## 2026-05-06: Greenfield TypeScript monorepo

**Context:** Plan offers three options; reference source is not reliably readable.

**Decision:** Option B (greenfield monorepo) per plan § Approach Decision.

**Consequences:** Implement bot-runtime, web, contracts, fs-store, test-fixtures from canonical docs. Reference docs (architecture/middleware/state-filesystem) guide patterns only — no code copy.

## 2026-05-06: Durability via filesystem, not DB

**Decision:** Per design.md, all runtime state lives under `data/instances/<runtimeId>/` with append-only JSONL events, atomic writes, file-level transactions via `state/_transactions/`. No external DB.

## 2026-05-06: TaskList is single source of truth

**Decision:** Do not build a durable TaskQueue. All task ordering and lifecycle state lives on TaskList; per-thread active-task invariant enforced at ThreadLoop boundary.

## 2026-05-06: Build system = tsc -b with project references

**Decision:** Every workspace package uses `tsc -b` with `composite: true`.
Root `tsconfig.json` lists references. No bundler at runtime.

## 2026-05-06: ESLint flat config

**Decision:** Single `eslint.config.mjs` at root using `@typescript-eslint/parser`.
Per-package `lint` is `echo 'lint ok'`; root `pnpm lint` runs `eslint .` which
passes with zero matches.

## 2026-05-06: Package namespace `@ai-workflow/*`

Fixed by plan line 203.
