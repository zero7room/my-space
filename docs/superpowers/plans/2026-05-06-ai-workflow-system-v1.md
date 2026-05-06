# AI Workflow System V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v1 one-shot deliverable described by `init/requirement.md` and `init/design.md`: an AI employee workflow system with confirmed tasks, durable runtime execution, Feishu-first channel integration, SSE visibility, retry/recovery, CriticalNodePolicy, skills, evals, and Agent Teams.

**Architecture:** Implement a TypeScript monorepo with a Node bot-runtime service, a Next.js client, and shared packages for schemas, state machines, filesystem persistence, event contracts, eval fixtures, and UI/API types. The runtime is a single-process hybrid master/worker in v1: ThreadLoop owns user communication and task lifecycle; Executor owns per-task agent loops and tools; Agent Teams are child collaboration units inside a parent task, not separate tasks. Durability is filesystem-first under `data/instances/<runtimeId>/`, using atomic writes, append-only JSONL, file-level transactions, leases, and recovery scans.

**Tech Stack:** TypeScript, Node.js 22+, pnpm workspace, Fastify API/SSE, Next.js App Router, React, Zod, Vitest, Playwright, OpenTelemetry, Prometheus metrics, Grafana JSON dashboards, Docker Compose for local orchestration.

---

## Source Inputs

- Product requirements: `init/requirement.md`
- Architecture design: `init/design.md`
- Reference documents:
  - `reference/xuedian/docs/architecture/state-filesystem.md`
  - `reference/xuedian/docs/superpowers/plans/2026-04-28-bot-runtime-fs-persistence.md`
  - `reference/deer-flow/backend/docs/ARCHITECTURE.md`
  - `reference/deer-flow/backend/docs/middleware-execution-flow.md`

Reference source code is not required for completion. If readable source directories are unavailable, implement from the contracts in `init/requirement.md`, `init/design.md`, and the reference docs above.

## Approach Decision

### Option A: Extend a reference project in place

Pros: faster if full source is present; fewer UI primitives to invent.

Cons: the current workspace is a planning repository, reference source files are not reliably readable, and the target semantics differ from DeerFlow and xuedian in TaskList, PlanRevision, MessageGuard, CriticalNodePolicy, retry, and Agent Teams.

Decision: do not use this as the main path.

### Option B: Greenfield TypeScript monorepo with copied architectural patterns

Pros: matches the final docs, keeps contracts explicit, lets Agent Teams parallelize by package, and avoids hidden coupling to incomplete references.

Cons: larger first scaffold and more API/UI code to build.

Decision: recommended path.

### Option C: Minimal runtime first, UI later

Pros: reduces first-day blast radius.

Cons: fails the product goal: client visibility, confirmations, blocked actions, Team panel, and SSE replay are v1 acceptance criteria, not optional polish.

Decision: use only as a fallback if nightly execution runs out of time; do not declare v1 done under this option.

## Agent Teams Operating Model

Claude Code should create an AgentsTeam at the start with these standing roles:

- **Lead / Integrator:** owns phase sequencing, merges outputs, enforces contracts, runs verification, and writes phase summaries.
- **Runtime Core Agent:** implements shared schemas, state machines, filesystem store, repositories, transactions, recovery, retry, ThreadLoop, Executor, tools, CriticalNodePolicy, skills, and Agent Teams runtime.
- **API / Channel Agent:** implements Fastify API, SSE, action endpoints, Feishu provider, ChannelProvider abstraction, inbound idempotency, outbound jobs, notify throttling, and auth.
- **Frontend Agent:** implements Next.js app, chat/thread/task/plan/artifact/channel views, blocked action panel, retry history, and Team panel.
- **Eval / Test Agent:** writes unit, integration, E2E, fake-clock recovery, Playwright, and agent eval suites; owns CI thresholds.
- **Ops / Security Agent:** implements sanitize, metrics, OTel, Grafana dashboards, runbooks, Docker Compose, and security reviews.
- **Reviewer Agent:** after each phase, performs a critical review against `init/requirement.md`, `init/design.md`, this plan, and the phase's tests. Findings must be fixed before moving to the next phase.

Concurrency rule: multiple agents can work in the same phase only if they touch disjoint packages or have a written interface contract checked into `packages/contracts` first. No agent may change shared event names, schema fields, status enums, or API paths without updating tests and the acceptance matrix in this file.

## Agent Context Persistence

Because this implementation is large enough for context compression to happen, Claude Code and its Agent Teams may use the local filesystem as persistent working memory during implementation. This is separate from the product runtime state store and exists only to coordinate implementation.

Use these files:

```text
docs/superpowers/implementation-memory/
  README.md
  phase-status.md
  decisions.md
  open-risks.md
  agent-handoffs/
    <phase>-<agent-role>.md
  reviews/
    <phase>-review.md
```

Rules:

- Keep these files concise and append-only where practical.
- Update `phase-status.md` after every phase with completed steps, commands run, failing checks, and next phase entry criteria.
- Record durable architectural decisions in `decisions.md` with date, context, decision, and consequences.
- Each subagent writes a handoff note before ending work, including changed files, tests run, unresolved risks, and assumptions.
- Reviewer findings go under `reviews/` and must be linked from `phase-status.md` until fixed.
- Do not store secrets, raw Feishu tokens, bearer tokens, private user data, or unredacted logs in implementation memory.
- If implementation memory conflicts with `init/requirement.md`, `init/design.md`, the spec wrapper, or this plan, the canonical docs and this plan win; update the memory file rather than changing product behavior silently.

## File Structure

Create this monorepo:

```text
apps/
  bot-runtime/
    src/
      api/
      auth/
      channels/
      critical-node/
      evals/
      executor/
      metrics/
      runtime/
      skills/
      state-store/
      teams/
      thread-loop/
      tools/
      index.ts
    tests/
  web/
    app/
    components/
    lib/
    tests/
packages/
  contracts/
    src/
      api/
      channels/
      events/
      ids.ts
      schemas.ts
      states.ts
      index.ts
  fs-store/
    src/
  test-fixtures/
    src/
docs/
  runbooks/
ops/
  grafana/
tests/
  e2e/
  evals/
    datasets/
    results/
tooling/
  docker-compose.local.yml
  scripts/
```

Modify or create root files:

```text
package.json
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
.env.example
.gitignore
README.md
```

## Global Invariants

- `TaskList` is the only durable ordered task collection. Do not introduce a durable `TaskQueue`.
- A thread has at most one active task.
- Draft tasks and draft plans never enter `TaskList`.
- Only `ownerUserId` can confirm, approve, cancel, pause, resume, retry, skip, or inspect protected history.
- All durable multi-file mutations use a file-level transaction record under `state/_transactions/`.
- Append-only events carry monotonic event IDs and transaction IDs when part of a transaction.
- `completed` and `cancelled` are terminal task states.
- Automatic retry only applies to `failureClass="transient_error"`.
- Retry does not cascade into subagents or Agent Teams.
- Agent Teams live inside a parent task; they never create new tasks or new threads.
- Teammates can spawn one-level subagents but cannot spawn teams and cannot call `finish_team`.
- CriticalNodePolicy is re-evaluated before every tool dispatch, including retry and teammate paths.
- Every disk write containing transcript, event text, team messages, work item descriptions, summaries, or failure reasons passes through the shared sanitizer unless explicitly marked LLM-memory-only.

## Phase 0: Repository Scaffold

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.env.example`
- Create: `README.md`
- Create: `apps/bot-runtime/package.json`
- Create: `apps/web/package.json`
- Create: `packages/contracts/package.json`
- Create: `packages/fs-store/package.json`
- Create: `packages/test-fixtures/package.json`
- Create: `tooling/docker-compose.local.yml`

- [ ] **Step 1: Bootstrap pnpm workspace**

Root `package.json` must include these scripts:

```json
{
  "type": "module",
  "private": true,
  "scripts": {
    "build": "pnpm -r build",
    "dev": "pnpm --parallel --filter @ai-workflow/bot-runtime --filter @ai-workflow/web dev",
    "lint": "pnpm -r lint",
    "test": "pnpm -r test",
    "test:e2e": "pnpm --filter @ai-workflow/bot-runtime test:e2e && pnpm --filter @ai-workflow/web test:e2e",
    "test:evals": "pnpm --filter @ai-workflow/bot-runtime test:evals",
    "verify": "pnpm lint && pnpm test && pnpm test:evals && pnpm test:e2e && pnpm build"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
pnpm add -w zod nanoid fast-json-stable-stringify
pnpm add -w -D typescript tsx vitest @types/node eslint prettier
pnpm --filter @ai-workflow/bot-runtime add fastify @fastify/cors @fastify/sensible prom-client @opentelemetry/api eventsource-parser yaml
pnpm --filter @ai-workflow/web add next react react-dom
pnpm --filter @ai-workflow/web add -D @playwright/test
```

Expected: lockfile created, all packages install without peer dependency errors.

- [ ] **Step 3: Add workspace package build/test scripts**

Every package must expose `build`, `lint`, and `test`. Empty packages use `vitest run --passWithNoTests` only during Phase 0; remove `--passWithNoTests` as each package gains tests.

- [ ] **Step 4: Verify scaffold**

Run:

```bash
pnpm install
pnpm verify
```

Expected: all scripts pass or only fail because later phase source files do not exist. Before committing Phase 0, make the scripts pass with minimal package index exports that re-export real modules as soon as each package gains source files.

Replace the Phase 0 temporary index exports with real exports in the phase that owns each package; do not leave a file whose only purpose is to satisfy the compiler after Phase 1.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json vitest.config.ts .env.example README.md apps packages tooling
git commit -m "chore: scaffold ai workflow monorepo"
```

## Phase 1: Contracts, IDs, Schemas, and State Machines

**Files:**
- Create: `packages/contracts/src/ids.ts`
- Create: `packages/contracts/src/states.ts`
- Create: `packages/contracts/src/schemas.ts`
- Create: `packages/contracts/src/events/kinds.ts`
- Create: `packages/contracts/src/events/schemas.ts`
- Create: `packages/contracts/src/api/routes.ts`
- Create: `packages/contracts/src/index.ts`
- Test: `packages/contracts/src/*.test.ts`

- [ ] **Step 1: Define branded IDs and runtime defaults**

Create ID factories for `runtimeId`, `userId`, `threadId`, `taskListId`, `taskId`, `planId`, `planRevisionId`, `bindingId`, `jobId`, `executorId`, `policyId`, `teamId`, `teammateId`, `workItemId`, `messageId`, `eventId`, and `transactionId`. Runtime ID validation must match `^[a-z0-9][a-z0-9-]{0,62}$`.

- [ ] **Step 1a: Freeze shared API route and DTO contracts**

Before API, runtime, frontend, channel, and team agents split work, define typed route constants and request/response DTO schemas in `packages/contracts/src/api/routes.ts` and `packages/contracts/src/api/schemas.ts`.

Required route families:

```text
GET  /api/users/me
GET  /api/threads
POST /api/threads
GET  /api/threads/{threadId}
POST /api/threads/{threadId}/messages
GET  /api/threads/{threadId}/events
POST /api/threads/{threadId}/ack
GET  /api/tasks/{taskId}
POST /api/tasks/{taskId}/confirm
POST /api/tasks/{taskId}/reject
POST /api/tasks/{taskId}/retry
POST /api/tasks/{taskId}/skip
POST /api/tasks/{taskId}/pause
POST /api/tasks/{taskId}/resume
POST /api/tasks/{taskId}/cancel
POST /api/tasks/{taskId}/critical-node/approve
POST /api/tasks/{taskId}/critical-node/reject
GET  /api/tasks/{taskId}/retry-history
GET  /api/tasks/{taskId}/plans
GET  /api/tasks/{taskId}/plans/{planRevisionId}
POST /api/tasks/{taskId}/plans/{planRevisionId}/confirm
POST /api/tasks/{taskId}/plans/{planRevisionId}/reject
GET  /api/artifacts/{artifactId}
POST /api/artifacts/{artifactId}/reseal
GET  /api/channels/configs
PUT  /api/channels/configs/{provider}
GET  /api/channels/bindings
POST /api/channels/bindings
DELETE /api/channels/bindings/{bindingId}
POST /api/channels/feishu/webhook
GET  /api/critical-node-policies
POST /api/critical-node-policies
PATCH /api/critical-node-policies/{policyId}
DELETE /api/critical-node-policies/{policyId}
GET  /api/skills/load-status
GET  /api/runtime/health
GET  /api/runtime/metrics
GET  /api/tasks/{taskId}/teams
GET  /api/tasks/{taskId}/teams/{teamId}
GET  /api/tasks/{taskId}/teams/{teamId}/work-items
GET  /api/tasks/{taskId}/teams/{teamId}/messages
GET  /api/tasks/{taskId}/teams/{teamId}/teammates
GET  /api/tasks/{taskId}/teams/{teamId}/teammates/{teammateId}/events
GET  /api/tasks/{taskId}/teams/{teamId}/events
GET  /api/tasks/{taskId}/teams/{teamId}/recovery-log
POST /api/tasks/{taskId}/teams/{teamId}/cancel
POST /api/tasks/{taskId}/teams/{teamId}/teammates/{teammateId}/approve
POST /api/tasks/{taskId}/teams/{teamId}/teammates/{teammateId}/reject
```

Every route schema must include owner/authorization behavior, event kinds it can write, and pagination/cursor fields where applicable. Frontend and API agents must import these contracts rather than duplicating strings.

- [ ] **Step 2: Write schema tests before implementation**

Tests must cover:

- `TaskList`, `ChangeRecord`, `ArtifactRecord`, `SkillManifest`: one valid sample, one missing-required-field negative sample per required field, and one enum-out-of-range negative sample per enum.
- `TaskRetryState`: valid samples for `transient_error`, `assertion_error`, `permission_error`, `user_cancelled`, `budget_overflow`; negatives for `attemptCount > maxRetries`, negative counts, invalid `failureClass`.
- Team schemas: valid and negative samples for `Team`, `TeamRosterSlot`, `TeamWorkItem`, `TeamMessage`, `Teammate`.

- [ ] **Step 3: Implement Zod schemas**

Use `z.object(...).strict()` for all durable objects. Include `schemaVersion: 2` on `Task`. `blockedReason` must be required whenever `status` is `blocked` or `failed`.

- [ ] **Step 4: Implement state transition guards**

Export pure functions:

```ts
canTransitionTask(from, to, context): TransitionDecision
applyTaskTransition(task, to, context): Task
canTransitionTeam(from, to): TransitionDecision
canTransitionTeammate(from, to): TransitionDecision
canTransitionWorkItem(from, to): TransitionDecision
```

Task transition tests must cover every edge in `init/design.md` §9.1 plus blocked/retry/pause/resume/cancel rules from `init/requirement.md` §10.1.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "feat: add shared runtime contracts"
```

## Phase 2: Filesystem Store and Transaction Primitives

**Files:**
- Create: `packages/fs-store/src/errors.ts`
- Create: `packages/fs-store/src/paths.ts`
- Create: `packages/fs-store/src/primitives.ts`
- Create: `packages/fs-store/src/keyed-mutex.ts`
- Create: `packages/fs-store/src/jsonl.ts`
- Create: `packages/fs-store/src/transactions.ts`
- Create: `packages/fs-store/src/locks.ts`
- Test: `packages/fs-store/src/*.test.ts`

- [ ] **Step 1: Implement `InstancePaths`**

Match this layout exactly:

```text
data/instances/<runtimeId>/
  .lock
  .runtime-info.json
  state/
    users/<userId>.json
    threads/
      <threadId>/
        thread.json
        transcript.jsonl
        guard-decisions.jsonl
        context/THREAD.md
        context/SUMMARY.md
        context/MEMORY.md
        drafts/task-draft.json
        drafts/plan-draft.json
        tasks/<taskId>/
          task.json
          plan.json
          plan-revisions/<planRevisionId>.json
          events.jsonl
          control.json
          logs/
          context/
          user-data/workspace/
          user-data/uploads/
          user-data/outputs/
          user-data/outputs/_archive/<planRevisionId>/
          teams/<teamId>/
            team.json
            control.json
            _message-seq
            team-events.jsonl
            messages.jsonl
            work-items/available/<workItemId>.json
            work-items/claimed/<workItemId>.json
            work-items/completed/<workItemId>.json
            work-items/failed/<workItemId>.json
            work-items/cancelled/<workItemId>.json
            teammates/<teammateId>/teammate.json
            teammates/<teammateId>/events.jsonl
            teammates/<teammateId>/control.json
            teammates/<teammateId>/context/
            teammates/<teammateId>/workspace/
            teammates/<teammateId>/uploads/
            teammates/<teammateId>/outputs/
            _archive/team-events.<archiveId>.jsonl.gz
            _archive/messages.<archiveId>.jsonl.gz
        task-list.json
    bindings/<threadId>/<channelType>/<bindingId>/active.json
    bindings/<threadId>/<channelType>/<bindingId>/history/
    chat-claims/<channelType>/<externalChatId>
    channels/<channelType>.json
    channel-messages/<channelType>/_idx/
    critical-node-policies/<policyId>.json
    _transactions/<transactionId>.json
    _locks/retry-scheduler.lock
    jobs/pending/<jobId>.json
    jobs/locked/<jobId>.json
    jobs/done/<jobId>.json
    jobs/failed/<jobId>.json
    jobs/dedupe/<dedupeKey>
    webhooks/<channelType>/<eventId>.json
    _index/
    _diagnostics/
  workspace/
  skills/public/
  skills/custom/
```

New writes must use `work-items/completed/`; `done/` is accepted only by migration/recovery code as legacy input.

- [ ] **Step 2: Implement atomic primitives**

Provide `atomicWriteJson`, `readJson`, `appendJsonl`, `exclusiveCreateJson`, `atomicRename`, `sha256File`, `ensureDir`, `listJsonFilesSorted`, and `safeRelativePath`. Every write must fsync file contents and parent directory where Node APIs allow it.

- [ ] **Step 3: Implement transaction log**

`FileTransaction` must write `prepared`, then write temp files, then atomically rename participants, then mark `committed`. Recovery must replay committed-but-incomplete transactions and rollback prepared-only transactions. Events written inside a transaction must carry `txId`.

- [ ] **Step 4: Implement instance lock and fencing token**

The lock file stores `lockHolderRuntimeId`, `acquiredAt`, `leaseExpireAt`, and `fencingToken`. Startup must reclaim stale locks by renaming them to `retry-scheduler.lock.stale.<oldFencingToken>` instead of unlinking.

- [ ] **Step 5: Test crash windows**

Use `mkdtempSync` real filesystem tests. Cover temp orphan cleanup, partial transaction replay, failed rename preservation, stale lock reclaim, and concurrent exclusive creates.

- [ ] **Step 6: Commit**

```bash
git add packages/fs-store
git commit -m "feat: add filesystem state primitives"
```

## Phase 3: Runtime Repositories and Recovery Scan

**Files:**
- Create: `apps/bot-runtime/src/runtime/paths.ts`
- Create: `apps/bot-runtime/src/runtime/repositories/*.ts`
- Create: `apps/bot-runtime/src/runtime/recovery.ts`
- Create: `apps/bot-runtime/src/runtime/migrations/task-retry-state.ts`
- Test: `apps/bot-runtime/src/runtime/**/*.test.ts`

- [ ] **Step 1: Implement repositories**

Repositories:

- `UserRepository`
- `ThreadRepository`
- `TaskListRepository`
- `TaskRepository`
- `PlanRepository`
- `PlanRevisionRepository`
- `ChangeRecordRepository`
- `ArtifactRepository`
- `GuardDecisionRepository`
- `CriticalNodePolicyRepository`
- `ChannelConfigRepository`
- `ChannelBindingRepository`
- `ChannelEventRepository`
- `ChannelJobRepository`
- `TeamRepository`

Each repository must validate with `packages/contracts` before writing.

- [ ] **Step 2: Implement append-only event writers**

Write task events to `tasks/<taskId>/events.jsonl`, guard decisions to `threads/<threadId>/guard-decisions.jsonl`, transcript to `threads/<threadId>/transcript.jsonl`, and team events/messages to the team directory. Event IDs are monotonic per thread/task stream.

- [ ] **Step 3: Implement recovery scan**

Startup sequence:

1. Acquire instance lock.
2. Clean `.tmp.*`.
3. Complete or rollback `state/_transactions`.
4. Migrate schemaVersion 1 tasks to schemaVersion 2 with `TaskRetryState`.
5. Reconcile `TaskList` with `tasks/`.
6. Scan artifacts and emit `artifact_consistency_warning`.
7. Requeue locked channel jobs.
8. Recover stale running tasks and executors.
9. Recover retry scheduler lock.
10. Recover teams according to forming/active/finishing rules.

- [ ] **Step 4: Test recovery**

Tests must assert emitted events and metrics for each recovery action, including `task_list_repair`, `artifact_consistency_warning`, `task_schema_migrated`, `retry_scheduler_lock_reclaimed`, `team_recovery_failed`, and `teammate_recovery_failed`.

- [ ] **Step 5: Commit**

```bash
git add apps/bot-runtime/src/runtime apps/bot-runtime/src/**/*.test.ts
git commit -m "feat: add durable runtime repositories"
```

## Phase 4: Fastify API, Auth, and SSE Foundation

**Files:**
- Create: `apps/bot-runtime/src/api/server.ts`
- Create: `apps/bot-runtime/src/api/routes/*.ts`
- Create: `apps/bot-runtime/src/auth/user-token.ts`
- Create: `apps/bot-runtime/src/runtime/sse/*.ts`
- Test: `apps/bot-runtime/src/api/**/*.test.ts`

- [ ] **Step 1: Implement bearer auth**

`Authorization: Bearer <user-token>` resolves to a v1 `User`. For local development, `.env` maps `LOCAL_USER_TOKENS=user-1:dev-token,user-2:reviewer-token`. Never log raw tokens.

- [ ] **Step 2: Implement contract-backed user/thread/task/plan APIs**

Endpoints:

```text
GET /api/users/me
GET /api/threads
POST /api/threads
GET /api/threads/{threadId}
POST /api/threads/{threadId}/messages
GET /api/threads/{threadId}/events
POST /api/threads/{threadId}/ack
GET /api/tasks/{taskId}
POST /api/tasks/{taskId}/confirm
POST /api/tasks/{taskId}/reject
POST /api/tasks/{taskId}/retry
POST /api/tasks/{taskId}/skip
POST /api/tasks/{taskId}/pause
POST /api/tasks/{taskId}/resume
POST /api/tasks/{taskId}/cancel
POST /api/tasks/{taskId}/critical-node/approve
POST /api/tasks/{taskId}/critical-node/reject
GET /api/tasks/{taskId}/retry-history
GET /api/tasks/{taskId}/plans
GET /api/tasks/{taskId}/plans/{planRevisionId}
POST /api/tasks/{taskId}/plans/{planRevisionId}/confirm
POST /api/tasks/{taskId}/plans/{planRevisionId}/reject
GET /api/artifacts/{artifactId}
POST /api/artifacts/{artifactId}/reseal
```

All action endpoints must validate owner before status and write `task_action_denied` before returning 403/409. Critical node reject maps to `control.json signal=cancel` for that pending tool call and writes `critical_node_resolved{decision:"rejected"}` without changing a completed/failed terminal task.

- [ ] **Step 2a: Implement policy, skill, channel, runtime, and team API surfaces**

Implement the remaining route contracts frozen in Phase 1:

```text
GET /api/channels/configs
PUT /api/channels/configs/{provider}
GET /api/channels/bindings
POST /api/channels/bindings
DELETE /api/channels/bindings/{bindingId}
POST /api/channels/feishu/webhook
GET /api/critical-node-policies
POST /api/critical-node-policies
PATCH /api/critical-node-policies/{policyId}
DELETE /api/critical-node-policies/{policyId}
GET /api/skills/load-status
GET /api/runtime/health
GET /api/runtime/metrics
GET /api/tasks/{taskId}/teams
GET /api/tasks/{taskId}/teams/{teamId}
GET /api/tasks/{taskId}/teams/{teamId}/work-items
GET /api/tasks/{taskId}/teams/{teamId}/messages
GET /api/tasks/{taskId}/teams/{teamId}/teammates
GET /api/tasks/{taskId}/teams/{teamId}/teammates/{teammateId}/events
GET /api/tasks/{taskId}/teams/{teamId}/events
GET /api/tasks/{taskId}/teams/{teamId}/recovery-log
POST /api/tasks/{taskId}/teams/{teamId}/cancel
POST /api/tasks/{taskId}/teams/{teamId}/teammates/{teammateId}/approve
POST /api/tasks/{taskId}/teams/{teamId}/teammates/{teammateId}/reject
```

Team endpoints use the same owner-first validation as task actions. Channel config responses must expose `hasSecret` booleans and never return raw secrets.

- [ ] **Step 3: Implement SSE ack and replay**

Server must maintain per-thread ring buffers with `RUNTIME_SSE_REPLAY_BUFFER_EVENTS=1000`, `RUNTIME_SSE_REPLAY_MAX_AGE_S=600`, and `RUNTIME_SSE_REPLAY_BUFFER_EVENTS_WITH_TEAM=2000` when an active team exists. Missing ack after `RUNTIME_SSE_ACK_TIMEOUT_MS=30000` writes `sse_ack_missing` and emits replay before new events.

- [ ] **Step 4: Test SSE invariants**

Cover normal ack, ack timeout replay, reconnect replay, cursor below buffer, buffer overflow, max age eviction, cold-start buffer backfill, monotonic event ID checks, and causal ordering rejection.

- [ ] **Step 5: Commit**

```bash
git add apps/bot-runtime/src/api apps/bot-runtime/src/auth apps/bot-runtime/src/runtime/sse
git commit -m "feat: add runtime API and SSE"
```

## Phase 5: ThreadLoop, MessageGuard, Task Confirmation, and Plan Revision

**Files:**
- Create: `apps/bot-runtime/src/thread-loop/thread-loop.ts`
- Create: `apps/bot-runtime/src/thread-loop/message-guard.ts`
- Create: `apps/bot-runtime/src/thread-loop/task-drafts.ts`
- Create: `apps/bot-runtime/src/thread-loop/plan-revisions.ts`
- Create: `apps/bot-runtime/src/evals/*.ts`
- Test: `apps/bot-runtime/src/thread-loop/**/*.test.ts`
- Create datasets: `tests/evals/datasets/message-guard.jsonl`, `task-confirmation.jsonl`, `plan-revision.jsonl`

- [ ] **Step 1: Implement deterministic guard short-circuits**

Bound group messages enter LLM guard only for `@bot`, reply to bot message, slash command, or pending confirmation from owner. Unbound group messages are ignored except Guardian binding commands. Client and Feishu private messages enter LLM guard by default.

- [ ] **Step 2: Implement structured LLM guard adapter**

The adapter returns a strict `GuardDecision` with intent in:

```text
chat, new_task, task_update, plan_update, confirm_task, confirm_plan,
progress_query, pause_task, resume_task, cancel_task, irrelevant
```

Fallback when LLM fails: use rules for slash confirmations/cancel/status; otherwise classify as `chat` and emit `guard_degraded`.

- [ ] **Step 3: Implement draft task/plan lifecycle**

ThreadLoop creates draft task and draft plan, exposes confirmation state, and only writes confirmed tasks into `TaskList` after owner confirmation. Non-owner confirmation in group chat becomes `chat` or `irrelevant`.

- [ ] **Step 4: Implement plan update transaction**

For `task_update` or `plan_update`:

1. Pause executor through `control.json`.
2. Wait for `executor_paused`.
3. Write new `PlanRevision`.
4. Write immutable `ChangeRecord`.
5. Archive active artifacts by marking records and moving paths under `_archive/<oldRevisionId>/`.
6. If task is failed, reset `TaskRetryState` in the same transaction.
7. Require owner confirmation.
8. Resume with new revision.

- [ ] **Step 5: Implement three evals**

Thresholds:

- MessageGuard: 200 samples, accuracy >= 90%, micro-F1 >= 0.85.
- TaskConfirmation: 50 samples, owner confirmation >= 95%, non-owner confirmation 0% enters gate.
- PlanRevision: 30 scenarios, every change creates `ChangeRecord`, new `PlanRevision`, and archived artifacts.

- [ ] **Step 6: Commit**

```bash
git add apps/bot-runtime/src/thread-loop apps/bot-runtime/src/evals tests/evals/datasets
git commit -m "feat: add thread loop and task confirmation"
```

## Phase 6: Executor, Runtime Loop, Tools, Skills, and CriticalNodePolicy

**Files:**
- Create: `apps/bot-runtime/src/executor/executor.ts`
- Create: `apps/bot-runtime/src/executor/model-adapter.ts`
- Create: `apps/bot-runtime/src/tools/*.ts`
- Create: `apps/bot-runtime/src/skills/*.ts`
- Create: `apps/bot-runtime/src/critical-node/*.ts`
- Test: `apps/bot-runtime/src/{executor,tools,skills,critical-node}/**/*.test.ts`

- [ ] **Step 1: Implement Executor loop**

Loop contract:

```text
read task + plan + context
construct model prompt
invoke model
validate proposed tool call
evaluate CriticalNodePolicy
execute tool or block
write events.jsonl
update plan step
handle control.json signals
finish with executor_finished
```

- [ ] **Step 2: Implement built-in tools**

Tools:

```text
read_file, write_file, list_dir, str_replace, bash, present_files,
ask_clarification, confirm_task, confirm_plan, confirm_critical_node,
update_task, update_plan, task, notify_bound_channel, team,
publish_work, claim_work, release_claim, complete_work, fail_work,
post_message, read_messages, finish_team
```

Filesystem tools may only write under `tasks/<taskId>/user-data/workspace/` and `outputs/`.
Team-internal tools are only visible to teammates and the parent Executor lead according to `init/design.md` §24: teammates cannot call `team` or `finish_team`; only the lead can call `finish_team`.

- [ ] **Step 3: Implement SkillManifest loading**

Load `skills/public/` and `skills/custom/`. Validate frontmatter snake_case fields, map to camelCase runtime model, isolate per-skill failures, emit `skills_load_error`, fallback to `state/_diagnostics/skills-cache.json` after repeated failures, and expose `GET /api/skills/load-status`.

- [ ] **Step 4: Implement CriticalNodePolicy**

Policy order: built-in, global, user, thread, skill. Strictness resolution: `block > require_approval > log_only`. Built-in high-risk skill approval must always exist. Hot reload must affect the next tool dispatch without runtime restart.

- [ ] **Step 5: Test runtime loop**

Cover successful tool calls, blocked policies, approval resume, policy hot reload, high-risk skill gate, bash path rejection, `ask_clarification` blockedReason, subagent limit, and control signals.

- [ ] **Step 6: Commit**

```bash
git add apps/bot-runtime/src/executor apps/bot-runtime/src/tools apps/bot-runtime/src/skills apps/bot-runtime/src/critical-node
git commit -m "feat: add executor loop and tools"
```

## Phase 7: Retry, Blocked Actions, Notify Throttling, and Recovery Hardening

**Files:**
- Create: `apps/bot-runtime/src/runtime/retry/*.ts`
- Create: `apps/bot-runtime/src/runtime/blocked-actions.ts`
- Create: `apps/bot-runtime/src/channels/notify-throttle.ts`
- Test: `apps/bot-runtime/src/runtime/retry/**/*.test.ts`

- [ ] **Step 1: Implement retry scheduler**

Poll every `RUNTIME_RETRY_POLL_MS=5000`. Scan `status=failed` tasks, sort by `retry.nextRetryAt`, require `failureClass="transient_error"`, `attemptCount < maxRetries`, and `now >= nextRetryAt`. Write `task_retry_scheduled` before state flips to `queued`. Do not retry `assertion_error`, `permission_error`, `user_cancelled`, or `budget_overflow`.

- [ ] **Step 2: Implement backoff and classifications**

Backoff: 30s, 120s, then 300s. Consecutive transient failures with low reason similarity emit `task_retry_classification_warning`. FailureClassClassification eval must own correctness.

- [ ] **Step 3: Implement manual actions**

`retry`, `skip`, `pause`, `resume`, `cancel` all use owner-first validation. `cancel` on failed tasks writes user signal and suppresses pending retry but does not change status to `cancelled`.

- [ ] **Step 4: Implement notify throttling**

Throttle `notify_bound_channel` by `(taskId, providerId, target, notificationKind)` for 15 minutes and by `(instance, provider, target)` at 30 RPM. User manual retry resets the task/provider/target window.

- [ ] **Step 5: Implement kill-9 replay**

On scheduler startup, replay recent `task_retry_scheduled` events (`RUNTIME_RETRY_REPLAY_DEPTH=100`) and repair tasks whose event exists but `task.status` remains `failed`. Increment `retry_scheduler_replay_corrected_total`.

- [ ] **Step 6: Test retry matrix**

Cover acceptance items 21-52 from `init/requirement.md`, including lock stealing, graceful shutdown, cancel race, pause race, plan update retry reset, budget overflow, TaskList ordering, CriticalNodePolicy re-evaluation, notification throttling, retry history API, and kill-9 recovery.

- [ ] **Step 7: Commit**

```bash
git add apps/bot-runtime/src/runtime/retry apps/bot-runtime/src/runtime/blocked-actions.ts apps/bot-runtime/src/channels/notify-throttle.ts
git commit -m "feat: add task retry and blocked actions"
```

## Phase 8: Channel Subsystem and Feishu Provider

**Files:**
- Create: `apps/bot-runtime/src/channels/core/*.ts`
- Create: `apps/bot-runtime/src/channels/feishu/*.ts`
- Create: `apps/bot-runtime/src/channels/guardian/*.ts`
- Test: `apps/bot-runtime/src/channels/**/*.test.ts`

- [ ] **Step 1: Define ChannelProvider interface**

Provider contract includes config, secret redaction, inbound verification, normalization, idempotency, binding, outbound jobs, sent message records, and status diagnostics.
The config API must support write-only secret updates and read responses shaped as `{ enabled, mode, hasSecret, lastVerifiedAt, lastError }`.

- [ ] **Step 2: Implement channel persistence**

Persist configs, bindings, channel events, outbound jobs, message records, and `chat-claims/<provider>/<externalChatId>`. Duplicate `(providerId,eventId)` returns 200 without guard execution and writes `inbound_duplicate`.
Webhook dedupe entries must expire after 24 hours through a startup scan and a periodic cleanup fiber; cleanup writes metrics for removed entries and never deletes active job dedupe keys.

- [ ] **Step 3: Implement Feishu webhook**

Support URL verification, `x-lark-request-*` signature verification, `im.message.receive_v1` text messages, private chat, group chat routing, `@bot`, reply-to-bot, and slash commands.
Normalize Feishu `operatorOpenId` through `User.channelIdentities`; unknown users follow the Guardian binding flow instead of creating privileged users implicitly.

- [ ] **Step 4: Implement Feishu long connection as optional mode**

Config chooses `webhook` or `long_connection`. Long connection can be disabled in local tests but the provider interface must support it.
Guardian must support creating a thread binding, claiming `chat-claims/<channelType>/<externalChatId>`, reporting binding status, and rejecting attempts to bind the same external chat to two threads.

- [ ] **Step 5: Implement outbound jobs**

Sending text messages, creating groups, deleting groups, and recording provider message IDs must run through async channel jobs. Job runner uses filesystem queue rename pending to locked.
Outbound success records provider message IDs so inbound reply-to-bot detection can prevent reply loops. Tests must cover message ID indexing, notify throttling interaction, job retry, and secret redaction in logs.

- [ ] **Step 6: Commit**

```bash
git add apps/bot-runtime/src/channels
git commit -m "feat: add channel subsystem and feishu provider"
```

## Phase 9: Agent Teams Runtime

**Files:**
- Create: `apps/bot-runtime/src/teams/team-tool.ts`
- Create: `apps/bot-runtime/src/teams/team-repository.ts`
- Create: `apps/bot-runtime/src/teams/teammate-loop.ts`
- Create: `apps/bot-runtime/src/teams/work-items.ts`
- Create: `apps/bot-runtime/src/teams/message-bus.ts`
- Create: `apps/bot-runtime/src/teams/reclaim-scanner.ts`
- Create: `apps/bot-runtime/src/teams/recovery.ts`
- Test: `apps/bot-runtime/src/teams/**/*.test.ts`
- Create dataset: `tests/evals/datasets/team-orchestration.jsonl`

- [ ] **Step 1: Implement `team` tool**

Input and output must match `init/design.md` §24.3. Validate roster, budgets, work item limits, idempotency key, and CriticalNodePolicy before creating a team. Duplicate idempotency key returns the existing team.

- [ ] **Step 2: Implement team directories**

Use:

```text
threads/<threadId>/tasks/<taskId>/teams/<teamId>/
  team.json
  control.json
  team-events.jsonl
  messages.jsonl
  _message-seq
  work-items/
    available/
    claimed/
    completed/
    failed/
    cancelled/
  teammates/<teammateId>/
    teammate.json
    events.jsonl
    workspace/
    outputs/
```

- [ ] **Step 3: Implement atomic claim**

`claim_work` scans `available`, filters by preferred role, sorts by priority desc and createdAt asc, then atomically renames to `claimed`. Five teammates racing for one item must yield exactly one winner and contention events for losers.

- [ ] **Step 3a: Implement all team-internal tools**

Implement and test:

```text
publish_work(description, preferredRole?, priority?)
claim_work(preferredRole?)
release_claim(workItemId, reason)
complete_work(workItemId, resultRef)
fail_work(workItemId, failureClass, reason)
post_message(to, kind, content, referencedWorkItemIds?)
read_messages(cursor?, limit?)
finish_team(teamId, reason, aggregateSummary?, harvestOutputs?)
```

`publish_work` enforces `RUNTIME_TEAM_MAX_WORK_ITEMS=32`; `post_message` enforces `RUNTIME_TEAM_MAX_MESSAGES=200`; `release_claim` returns an item to `available` only if the caller still owns the fencing token; `complete_work` moves to `completed/` and emits `work_item_completed`; `fail_work` moves to `failed/` and emits `work_item_failed`.

- [ ] **Step 4: Implement teammate loop**

Teammates read messages, claim work, run a restricted Executor-like loop, renew leases, call allowed tools, complete/fail work, and honor cancel/pause/critical node signals. They cannot call `team` or `finish_team`.

- [ ] **Step 5: Implement message bus and lead loop integration**

`post_message`, `read_messages`, and lead cursor handling must enforce visibility by `to=broadcast|lead|teammateId`. Message budget emits `team_budget_near_limit` at 90% and `team_message_budget_exhausted` at 100%.

- [ ] **Step 6: Implement `finish_team`**

Only lead can call it. It moves team to `finishing`, gracefully cancels teammates, waits for terminal states, writes `team_completed` to parent task events, and optionally harvests outputs.

- [ ] **Step 7: Implement TeamOrchestration eval**

150 samples: direct 50, subagent 50, team 50. Thresholds: three-class accuracy >= 80%, team recall >= 0.85, team precision >= 0.75, role micro-F1 >= 0.7.

- [ ] **Step 8: Commit**

```bash
git add apps/bot-runtime/src/teams tests/evals/datasets/team-orchestration.jsonl
git commit -m "feat: add agent teams runtime"
```

## Phase 10: Web Client Product Surface

**Files:**
- Create: `apps/web/app/page.tsx`
- Create: `apps/web/app/threads/[threadId]/page.tsx`
- Create: `apps/web/components/chat/*`
- Create: `apps/web/components/task/*`
- Create: `apps/web/components/plan/*`
- Create: `apps/web/components/artifacts/*`
- Create: `apps/web/components/channels/*`
- Create: `apps/web/components/teams/*`
- Create: `apps/web/lib/api.ts`
- Create: `apps/web/lib/sse.ts`
- Test: `apps/web/tests/*.spec.ts`

- [ ] **Step 1: Implement app shell**

Thread list, active thread, chat transcript, status bar, and connection degraded state. Use bearer token from local dev config.

- [ ] **Step 2: Implement task and plan views**

TaskList view shows confirmed/queued/running/blocked/paused/changing/completed/failed/cancelled. Active task view shows status, blockedReason, suggested actions, plan steps, current revision, runtime events, and artifacts.

- [ ] **Step 3: Implement confirmation interactions**

Task confirmation, plan confirmation, plan change confirmation, critical node approval, pause/resume/cancel/retry/skip. Non-owner 403 and invalid-state 409 must show clear messages.

- [ ] **Step 4: Implement channel configuration**

Channel drawer supports enable/disable, Feishu provider config, secret write-only fields, `hasSecret` display, binding states, and Guardian binding status.

- [ ] **Step 5: Implement artifact panel**

Only active artifacts render by default. Drift warnings from `artifact_consistency_warning` show red error state and optional owner reseal action.

- [ ] **Step 6: Implement Team panel**

Roster grid, work item four-column list, team message feed, per-teammate events drawer, teammate critical node approve/reject, and owner-only team cancel.

- [ ] **Step 7: Implement SSE client**

Ack every `RUNTIME_SSE_ACK_INTERVAL_MS=10000`, reconnect with cursor, handle replay, reload-required, degraded state, and preserve blocked action panel across reconnect.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "feat: add workflow web client"
```

## Phase 11: Observability, Sanitization, Ops, and Docs

**Files:**
- Create: `apps/bot-runtime/src/metrics/*.ts`
- Create: `apps/bot-runtime/src/security/sanitize.ts`
- Create: `apps/bot-runtime/src/security/patterns.ts`
- Create: `apps/bot-runtime/src/runtime/event-archive.ts`
- Create: `apps/bot-runtime/src/teams/team-archive.ts`
- Create: `apps/bot-runtime/src/runtime/cleanup.ts`
- Create: `ops/grafana/retry-dashboard.json`
- Create: `ops/grafana/team-dashboard.json`
- Create: `docs/runbooks/retry-troubleshooting.md`
- Create: `docs/runbooks/team-recovery.md`
- Create: `tooling/scripts/runbook-check.ts`

- [ ] **Step 1: Implement sanitizer**

Cover email, phone, api_key, bearer_token, credit_card with Luhn, and id_number. Disk writes use redacted text. LLM memory classification paths retain original text. Regex failure or >16KB failure reason truncates safely and emits redaction failure events.

- [ ] **Step 2: Implement metrics**

Expose every metric listed in `init/design.md` §19, including retry, blocked actions, SSE, inbound duplicate, artifact consistency, skill load, and Agent Teams metrics.

- [ ] **Step 3: Implement OpenTelemetry traces**

Include `runtimeId`, `role`, `threadId`, `taskId`, `executorId`, `teamId`, `teammateId`, `fencingToken`, `eventKind`, and `durationMs`. Propagate `traceparent` through job files.

- [ ] **Step 4: Create Grafana dashboards**

`retry-dashboard.json` must include the five rows and three alerts from `init/design.md` §19.1. `team-dashboard.json` must include team started/completed, active teammate counts, claim contention, budget exhausted, recovery failed, and message volume.

- [ ] **Step 5: Create runbooks**

Retry runbook must include five SOPs: retry storm, stale lock accumulation, schema migration failure, classification warning storm, kill-9 retry recovery blocked. Team runbook must include forming crash, no survivors, claim thrashing, teammate critical node stuck, and budget exhaustion.

- [ ] **Step 6: Implement event and team archive jobs**

Implement active `events.jsonl` rotation at `RUNTIME_EVENTS_JSONL_MAX_BYTES=67108864` or `RUNTIME_EVENTS_JSONL_MAX_AGE_DAYS=30`. Rotation must fsync, gzip to `events-archive/<taskId>/<archiveId>.jsonl.gz`, create a fresh active file with `events_jsonl_rotated`, and preserve the old file on compression or rename failure. Recovery must recognize incomplete `.tmp` archives and must include archives in historical event reads while excluding them from live SSE replay.

Implement team archive rules for terminal teams: after `RUNTIME_TEAM_DIRECTORY_ARCHIVE_DAYS=30`, archive the whole team directory to `threads/<threadId>/tasks/<taskId>/user-data/outputs/_archive/teams/<teamId>.tar.gz` while preserving `team-events` and `messages` history APIs. Team event/message JSONL streams also rotate before directory-level archive using `threads/<threadId>/tasks/<taskId>/teams/<teamId>/_archive/team-events.<archiveId>.jsonl.gz` and `threads/<threadId>/tasks/<taskId>/teams/<teamId>/_archive/messages.<archiveId>.jsonl.gz`.

Implement dedupe and stale cleanup jobs:

- webhook dedupe files expire after 24h;
- `jobs/dedupe/<dedupeKey>` is pruned only after owning job is done or failed;
- stale retry scheduler lock files are retained at least 7 days before cleanup;
- transaction logs are retained at least 7 days after commit.

- [ ] **Step 7: Commit**

```bash
git add apps/bot-runtime/src/metrics apps/bot-runtime/src/security apps/bot-runtime/src/runtime apps/bot-runtime/src/teams ops docs/runbooks tooling/scripts
git commit -m "feat: add observability and runbooks"
```

## Phase 12: E2E, Agent Evals, CI, and Final Acceptance

**Files:**
- Create: `tests/e2e/*.spec.ts`
- Create: `tests/evals/runner.ts`
- Create: `tests/evals/datasets/failure-class.jsonl`
- Create: `tests/evals/results/.gitkeep`
- Create: `.github/workflows/ci.yml` if GitHub Actions is available; otherwise create `tooling/scripts/ci-local.sh`

- [ ] **Step 1: Implement E2E scripts**

Required E2E:

1. Client message -> guard -> task draft -> owner confirm -> plan confirm -> execute -> completed.
2. Non-owner confirmation in group does not confirm task.
3. Runtime restart preserves thread/task/plan/transcript/artifact.
4. Duplicate Feishu webhook event creates one GuardDecision.
5. kill-9 retry recovery completes within 90s.
6. CriticalNodePolicy hot reload affects next external IO.
7. Plan update during execution archives old artifacts and resumes new revision.
8. SSE reconnect with ack replay preserves blocked action buttons.
9. Agent Team happy path with 2 slots and 4 work items.
10. Parent cancel cascades to active team.
11. Plan update cancels active team before PlanRevision transaction.

- [ ] **Step 2: Implement all five agent evals**

Runner writes `tests/evals/results/<date>/<eval-name>.json` and `summary.json`. Any threshold failure exits non-zero.

Required eval datasets and thresholds:

```text
message-guard.jsonl: 200 samples, intent accuracy >= 90%, micro-F1 >= 0.85
task-confirmation.jsonl: 50 samples, owner confirmation >= 95%, non-owner confirmation gate rate = 0%
plan-revision.jsonl: 30 scenarios, every sample creates ChangeRecord + PlanRevision + archived ArtifactRecord paths
failure-class.jsonl: 200 samples, 50 each for transient_error/assertion_error/permission_error/user_cancelled, overall accuracy >= 90%, per-class precision/recall >= 0.85, micro-F1 >= 0.85
team-orchestration.jsonl: 150 samples, 50 each for direct/subagent/team, accuracy >= 80%, team recall >= 0.85, team precision >= 0.75, role micro-F1 >= 0.7
```

`failure-class.jsonl` sample shape must be `{ "lastFailureReason": string, "expectedFailureClass": "transient_error" | "assertion_error" | "permission_error" | "user_cancelled" }`. Eval output path is `tests/evals/results/<date>/failure-class.json`; failures append misclassified examples to a review report but do not mutate the dataset automatically.

- [ ] **Step 3: Implement local CI**

`pnpm verify` must run lint, typecheck, unit tests, evals, E2E, build, runbook checks, and dashboard JSON validation.

- [ ] **Step 4: Product review pass**

Reviewer Agent must use the product acceptance list in `init/requirement.md` §10.1 and produce a checklist result. Every item 1-69 must be `pass` with evidence path, or the implementation is not done.

- [ ] **Step 5: Security review pass**

Security review must cover token logging, secret display, Feishu signature verification, auth ordering, filesystem path traversal, sanitize coverage, external IO critical nodes, and high-risk skills.

- [ ] **Step 6: Commit**

```bash
git add tests .github tooling
git commit -m "test: add end-to-end acceptance coverage"
```

## Final Verification Commands

Run from repository root:

```bash
pnpm install
pnpm lint
pnpm test
pnpm test:evals
pnpm test:e2e
pnpm build
pnpm verify
```

Expected:

- All unit/integration tests pass.
- All five evals meet thresholds.
- E2E kill-9 retry recovery completes under 90000 ms.
- Dashboard JSON validates.
- Runbook executable checks pass.
- Product acceptance checklist covers all `init/requirement.md` §10.1 items 1-69.

## Phase Review Protocol

After each phase:

1. Runtime Core/API/Frontend/Ops/Test agents each write a short handoff note listing changed files, passing commands, and open risks.
2. Reviewer Agent compares implementation with this plan and `init/design.md`.
3. Lead fixes all P0/P1 findings before the next phase.
4. Lead commits once the phase is green.

Final review order:

1. Code critical review.
2. Product review against acceptance criteria.
3. Security review.
4. E2E and eval verification.
5. Documentation/runbook verification.
6. One final `pnpm verify`.

## Acceptance Matrix

The final implementation is complete only when these groups pass:

- Core lifecycle: requirements §10.1 items 1-8.
- Persistence/recovery/idempotency: items 9-20, 35-38, 44, 53-56.
- Retry/blocked actions/SSE/notify: items 21-52, 54.
- Channel/Feishu: items 10, 12, 41-43, 53.
- Skills/CriticalNodePolicy: items 12-13, 49, 56.
- Agent Teams: items 57-69.
- Client surface: requirements §7 and all owner/action/Team panel rules.
- Ops: design §19 dashboards, metrics, alerts, and runbooks.
- Evals: MessageGuard, TaskConfirmation, PlanRevision, FailureClassClassification, TeamOrchestration.

## Known Risks and Guardrails

- Do not let Agent Teams implementation mutate Task semantics. WorkItem is not Task.
- Do not invent durable TaskQueue. Queue is a projection from TaskList.
- Do not persist unredacted secrets or PII in transcript, events, team messages, summaries, or retry reasons.
- Do not cache CriticalNodePolicy approvals across retry or teammate boundaries.
- Do not treat reference code as source of truth over `init/requirement.md` and `init/design.md`.
- Do not declare v1 done with runtime-only completion; the client, ops, evals, and Agent Teams are in scope.
