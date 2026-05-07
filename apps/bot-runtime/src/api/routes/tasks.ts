import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  type Task,
  type TaskControl,
  applyTaskTransition,
  newEventId,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../../runtime/paths.js';
import type { SseRegistry } from '../../runtime/sse/index.js';
import type { TaskIndex } from '../../runtime/task-index.js';

interface Deps {
  rt: RuntimePaths;
  sse: SseRegistry;
  taskIndex: TaskIndex;
}

interface TaskHandle {
  task: Task;
  threadId: string;
}

async function loadTask(
  rt: RuntimePaths,
  taskIndex: TaskIndex,
  taskId: string,
): Promise<TaskHandle | undefined> {
  const indexedThread = taskIndex.threadFor(taskId);
  if (indexedThread) {
    const got = await rt.tasks.get(indexedThread, taskId);
    if (got) return { task: got, threadId: indexedThread };
  }
  // Fallback scan + index repair.
  const threads = await rt.threads.list();
  for (const t of threads) {
    const got = await rt.tasks.get(t.id, taskId);
    if (got) {
      await taskIndex.note(taskId, t.id);
      return { task: got, threadId: t.id };
    }
  }
  return undefined;
}

async function pushControlSignal(
  rt: RuntimePaths,
  threadId: string,
  task: Task,
  kind: 'cancel' | 'pause' | 'resume' | 'revise' | 'critical_node_decision' | 'manual_retry' | 'skip',
  userId: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  const existing: TaskControl =
    (await rt.tasks.readControl(threadId, task.id)) ?? {
      taskId: task.id,
      pendingSignals: [],
      updatedAt: new Date().toISOString(),
    };
  existing.pendingSignals.push({
    kind,
    messageId: newEventId(),
    userId,
    payload,
    createdAt: new Date().toISOString(),
  });
  existing.updatedAt = new Date().toISOString();
  await rt.tasks.writeControl(threadId, task.id, existing);
}

function ownerCheck(
  req: FastifyRequest,
  task: Task,
  reply: FastifyReply,
): boolean {
  if (req.auth!.user.id !== task.ownerUserId) {
    reply.code(403).send({
      error: { code: 'forbidden', message: 'owner-only action' },
    });
    return false;
  }
  return true;
}

/**
 * Owner check for action endpoints. On rejection, also writes a
 * `task_action_denied{reason:"not_owner"}` event per acceptance 42.
 */
async function ownerCheckForAction(
  req: FastifyRequest,
  task: Task,
  threadId: string,
  reply: FastifyReply,
  deps: Deps,
  requestedAction: string,
): Promise<boolean> {
  if (req.auth!.user.id === task.ownerUserId) return true;
  const now = new Date().toISOString();
  const ev = await deps.rt.tasks.appendEvent(threadId, task.id, {
    kind: 'task_action_denied',
    taskId: task.id,
    threadId,
    payload: {
      requestedAction,
      reason: 'not_owner',
      requestedByUserId: req.auth!.user.id,
    },
    at: now,
  });
  deps.sse.publish(ev);
  reply.code(403).send({
    error: { code: 'forbidden', message: 'owner-only action' },
  });
  return false;
}

export function registerTaskRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId',
    async (req, reply) => {
      const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!ownerCheck(req, h.task, reply)) return;
      return { task: h.task };
    },
  );

  const action = (
    routePath: string,
    fn: (
      args: { req: FastifyRequest; reply: FastifyReply; handle: TaskHandle },
    ) => Promise<unknown>,
  ): void => {
    app.post<{ Params: { taskId: string } }>(routePath, async (req, reply) => {
      const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!ownerCheck(req, h.task, reply)) return;
      return fn({ req, reply, handle: h });
    });
  };

  // Owner-first actions: write a control-signal record + emit event.
  action('/api/tasks/:taskId/confirm', async ({ handle, req }) => {
    const now = new Date().toISOString();
    if (handle.task.status !== 'draft') {
      return {
        error: { code: 'invalid_state', message: 'task is not draft' },
      };
    }
    const next = applyTaskTransition(handle.task, 'confirmed', { now });
    next.confirmedByUserId = req.auth!.user.id;
    await deps.rt.tasks.update(next);
    const ev = await deps.rt.tasks.appendEvent(handle.threadId, next.id, {
      kind: 'task_confirmed',
      taskId: next.id,
      threadId: handle.threadId,
      payload: { actorUserId: req.auth!.user.id },
      at: now,
    });
    deps.sse.publish(ev);
    return { task: next };
  });

  action('/api/tasks/:taskId/reject', async ({ handle, req }) => {
    const now = new Date().toISOString();
    const next = applyTaskTransition(handle.task, 'cancelled', { now });
    await deps.rt.tasks.update(next);
    const ev = await deps.rt.tasks.appendEvent(handle.threadId, next.id, {
      kind: 'task_rejected',
      taskId: next.id,
      threadId: handle.threadId,
      payload: { actorUserId: req.auth!.user.id },
      at: now,
    });
    deps.sse.publish(ev);
    return { task: next };
  });

  action('/api/tasks/:taskId/retry', async ({ handle, req }) => {
    if (handle.task.status !== 'failed') {
      return {
        error: { code: 'invalid_state', message: 'task not failed' },
      };
    }
    await pushControlSignal(
      deps.rt,
      handle.threadId,
      handle.task,
      'manual_retry',
      req.auth!.user.id,
    );
    return { task: handle.task };
  });

  app.post<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId/skip',
    async (req, reply) => {
      const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!(await ownerCheckForAction(req, h.task, h.threadId, reply, deps, 'skip'))) {
        return;
      }
      const handle = h;
      const now = new Date().toISOString();
      const userId = req.auth!.user.id;
      // status gate per acceptance 32 + 42
      const skippableReasons = new Set([
        'awaiting_user_action',
        'non_idempotent_tool_in_flight',
      ]);
      const validState =
        handle.task.status === 'blocked' &&
        handle.task.blockedReason !== undefined &&
        skippableReasons.has(handle.task.blockedReason);
      if (!validState) {
        const ev = await deps.rt.tasks.appendEvent(
          handle.threadId,
          handle.task.id,
          {
            kind: 'task_action_denied',
            taskId: handle.task.id,
            threadId: handle.threadId,
            payload: {
              requestedAction: 'skip',
              reason: 'invalid_state',
              requestedByUserId: userId,
              currentStatus: handle.task.status,
              currentBlockedReason: handle.task.blockedReason,
            },
            at: now,
          },
        );
        deps.sse.publish(ev);
        return reply.code(409).send({
          error: { code: 'invalid_state', message: 'task not skip-eligible' },
        });
      }
      const plan = await deps.rt.plans.get(handle.threadId, handle.task.id);
      const activeIdx = plan
        ? plan.steps.findIndex((s) => s.status === 'in_progress')
        : -1;
      const fallbackIdx = plan
        ? plan.steps.findIndex((s) => s.status === 'pending')
        : -1;
      const idx = activeIdx >= 0 ? activeIdx : fallbackIdx;
      if (!plan || idx < 0) {
        const ev = await deps.rt.tasks.appendEvent(
          handle.threadId,
          handle.task.id,
          {
            kind: 'task_action_denied',
            taskId: handle.task.id,
            threadId: handle.threadId,
            payload: {
              requestedAction: 'skip',
              reason: 'invalid_state',
              requestedByUserId: userId,
              detail: 'no_skippable_step',
            },
            at: now,
          },
        );
        deps.sse.publish(ev);
        return reply.code(409).send({
          error: {
            code: 'invalid_state',
            message: 'no active plan step to skip',
          },
        });
      }
      const skippedStep = plan.steps[idx]!;
      const updatedSteps = plan.steps.slice();
      updatedSteps[idx] = { ...skippedStep, status: 'skipped' as const };
      await deps.rt.plans.save(handle.threadId, {
        ...plan,
        steps: updatedSteps,
        updatedAt: now,
      });
      const next = applyTaskTransition(handle.task, 'queued', { now });
      next.lastUserSignalAt = now;
      await deps.rt.tasks.update(next);
      const stepEv = await deps.rt.tasks.appendEvent(handle.threadId, next.id, {
        kind: 'plan_step_skipped',
        taskId: next.id,
        threadId: handle.threadId,
        payload: { stepId: skippedStep.id, actorUserId: userId },
        at: now,
      });
      deps.sse.publish(stepEv);
      const resolvedEv = await deps.rt.tasks.appendEvent(
        handle.threadId,
        next.id,
        {
          kind: 'task_block_resolved',
          taskId: next.id,
          threadId: handle.threadId,
          payload: {
            action: 'skip',
            actorUserId: userId,
            stepId: skippedStep.id,
          },
          at: now,
        },
      );
      deps.sse.publish(resolvedEv);
      return { task: next };
    },
  );

  for (const verb of ['pause', 'resume', 'cancel'] as const) {
    action(`/api/tasks/:taskId/${verb}`, async ({ handle, req }) => {
      await pushControlSignal(
        deps.rt,
        handle.threadId,
        handle.task,
        verb,
        req.auth!.user.id,
      );
      return { task: handle.task };
    });
  }

  action(
    '/api/tasks/:taskId/critical-node/approve',
    async ({ handle, req, reply }) => {
      void reply;
      await pushControlSignal(
        deps.rt,
        handle.threadId,
        handle.task,
        'critical_node_decision',
        req.auth!.user.id,
        { decision: 'approved' },
      );
      return { task: handle.task };
    },
  );
  action(
    '/api/tasks/:taskId/critical-node/reject',
    async ({ handle, req }) => {
      await pushControlSignal(
        deps.rt,
        handle.threadId,
        handle.task,
        'critical_node_decision',
        req.auth!.user.id,
        { decision: 'rejected' },
      );
      return { task: handle.task };
    },
  );

  app.get<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId/retry-history',
    async (req, reply) => {
      const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!ownerCheck(req, h.task, reply)) return;
      const events = await deps.rt.tasks.readEventsSince(
        h.threadId,
        h.task.id,
      );
      // Acceptance 52: surface the full retry chain — all 7 retry-related
      // event kinds so the UI can show every transition (manual, automatic,
      // skipped, classification warnings, plan_update resets, archives).
      const RETRY_KINDS = new Set([
        'task_retry_scheduled',
        'task_retry_started',
        'task_retry_exhausted',
        'task_retry_skipped',
        'task_retry_classification_warning',
        'task_manual_retry_requested',
        'task_retry_reset_by_plan_update',
        'events_jsonl_rotated',
      ]);
      const entries = events
        .filter((e) => RETRY_KINDS.has(e.kind))
        .map((e) => ({
          eventId: e.id,
          kind: e.kind,
          at: e.at,
          attemptCount: (e.payload['attemptCount'] as number) ?? 0,
          failureClass: e.payload['failureClass'] as string | undefined,
          failureReason: (e.payload['failureReason'] as string) ?? undefined,
          nextRetryAt: e.payload['nextRetryAt'] as string | undefined,
          triggeredBy:
            e.kind === 'task_manual_retry_requested'
              ? 'user'
              : e.kind === 'task_retry_reset_by_plan_update'
                ? 'plan_update'
                : 'master',
          summary: (e.payload['summary'] as string) ?? '',
        }));
      return { taskId: h.task.id, entries };
    },
  );

  app.get<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId/plans',
    async (req, reply) => {
      const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!ownerCheck(req, h.task, reply)) return;
      const plan = await deps.rt.plans.get(h.threadId, h.task.id);
      const revisions = await deps.rt.planRevisions.list(h.threadId, h.task.id);
      return { plan, revisions };
    },
  );

  app.get<{ Params: { taskId: string; planRevisionId: string } }>(
    '/api/tasks/:taskId/plans/:planRevisionId',
    async (req, reply) => {
      const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!ownerCheck(req, h.task, reply)) return;
      const rev = await deps.rt.planRevisions.get(
        h.threadId,
        h.task.id,
        req.params.planRevisionId,
      );
      if (!rev) return reply.code(404).send({ error: { code: 'not_found' } });
      return { revision: rev };
    },
  );

  for (const v of ['confirm', 'reject'] as const) {
    app.post<{ Params: { taskId: string; planRevisionId: string } }>(
      `/api/tasks/:taskId/plans/:planRevisionId/${v}`,
      async (req, reply) => {
        const h = await loadTask(deps.rt, deps.taskIndex, req.params.taskId);
        if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
        if (!ownerCheck(req, h.task, reply)) return;
        await pushControlSignal(
          deps.rt,
          h.threadId,
          h.task,
          'revise',
          req.auth!.user.id,
          { planRevisionId: req.params.planRevisionId, decision: v },
        );
        return { ok: true };
      },
    );
  }
}
