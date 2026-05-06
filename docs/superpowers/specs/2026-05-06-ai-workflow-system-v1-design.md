# AI Workflow System V1 Design Spec

## Purpose

This spec is a superpowers handoff wrapper for the AI workflow system v1 implementation. The canonical product and architecture specifications already exist in:

- `init/requirement.md`
- `init/design.md`

Do not duplicate or reinterpret those documents. Treat them as the source of truth for scope, terminology, acceptance criteria, state machines, filesystem layout, APIs, Agent Teams, retry, SSE, Feishu, observability, and eval requirements.

## Goal

Build the v1 one-shot deliverable described by the canonical docs: an AI employee workflow system with durable task execution, confirmed task/plan gates, runtime visibility, Feishu-first channel integration, retry and recovery, CriticalNodePolicy, skills, SSE, Agent Teams, client UI, observability, runbooks, and five mandatory agent evals.

## Architecture Summary

The implementation should use a TypeScript monorepo with:

- `apps/bot-runtime`: Node/Fastify runtime service, v1 hybrid master/worker.
- `apps/web`: Next.js client for chat, task, plan, artifact, channel, and Team views.
- `packages/contracts`: shared schemas, state machines, API DTOs, event kinds, and route constants.
- `packages/fs-store`: filesystem persistence primitives, transactions, JSONL, locks, and recovery helpers.
- `tests/evals` and `tests/e2e`: mandatory eval and end-to-end coverage.

The runtime model is:

- `ThreadLoop` owns thread communication, MessageGuard, task/plan drafts, confirmations, plan revisions, and user control signals.
- `Executor` owns per-task agent loops, tools, events, artifact generation, CriticalNodePolicy evaluation, and task completion.
- `Agent Teams` are child collaboration units inside a parent task. They do not create new tasks, do not create new threads, and do not have independent retry scheduling.

## Scope

Everything listed in `init/requirement.md` §10.1 and `init/design.md` §23.1 is in scope for v1. This includes:

- filesystem state store and recovery;
- User, Thread, TaskList, Task, Plan, PlanRevision, ChangeRecord, ArtifactRecord, SkillManifest, GuardDecision, ChannelConfig, ChannelBinding, CriticalNodePolicy, Team, Teammate, TeamWorkItem, and TeamMessage models;
- ThreadLoop, Executor, runtime loop, tool protocol, skills, MessageGuard, CriticalNodePolicy, and retry scheduler;
- Feishu provider and generic ChannelProvider abstraction;
- SSE ack/replay and client visibility;
- blocked action APIs and owner-first authorization;
- Agent Teams runtime, team tools, Team panel, recovery, metrics, and evals;
- observability, dashboards, runbooks, sanitization, E2E, and mandatory evals.

## Non-Goals

Follow the non-goals in `init/requirement.md` §9 and `init/design.md` §23.1. In particular, v1 must not add:

- multi-machine master/worker deployment;
- durable TaskQueue as a separate source of truth;
- multiple active tasks per thread;
- Team-level retry scheduler;
- nested teams;
- Slack, enterprise WeChat, email, or other full providers beyond Feishu;
- enterprise RBAC, orgs, tenants, billing, plugin marketplace, or skill trust list.

## Implementation Plan

Use this plan for execution:

`docs/superpowers/plans/2026-05-06-ai-workflow-system-v1.md`

The plan is structured for Claude Code Agent Teams. It freezes shared contracts early, then splits implementation across runtime, API/channel, frontend, eval/test, ops/security, and reviewer roles.

## Implementation Memory

During implementation, Claude Code and Agent Teams may use local filesystem files as persistent working memory to survive context compression and long-running multi-agent execution.

Use:

`docs/superpowers/implementation-memory/`

This memory is only for implementation coordination: phase status, decisions, handoffs, review findings, open risks, and verification evidence. It is not product runtime state and must not contain secrets or unredacted private data. If memory notes conflict with `init/requirement.md`, `init/design.md`, or the implementation plan, the canonical docs and plan win.

## Acceptance

The implementation is acceptable only when:

- every item in `init/requirement.md` §10.1 passes with evidence;
- every v1 scope item in `init/design.md` §23.1 is implemented or explicitly proven not applicable;
- all five mandatory evals pass their thresholds;
- E2E tests cover core lifecycle, Feishu idempotency, restart recovery, kill-9 retry recovery, CriticalNodePolicy hot reload, plan revision, SSE replay, and Agent Teams;
- final `pnpm verify` passes.

## Handoff Rule

If this wrapper spec conflicts with `init/requirement.md` or `init/design.md`, the canonical docs win. If the implementation plan conflicts with the canonical docs, update the plan before coding.
