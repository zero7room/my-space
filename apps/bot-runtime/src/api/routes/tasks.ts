import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  type Task,
  type TaskControl,
  applyTaskTransition,
  newEventId,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../../runtime/paths.js';
import type { SseRegistry } from '../../runtime/sse/index.js';

interface Deps {
  rt: RuntimePaths;
  sse: SseRegistry;
}

interface TaskHandle {
  task: Task;
  threadId: string;
}

async function loadTask(
  rt: RuntimePaths,
  taskId: string,
): Promise<TaskHandle | undefined> {
  // Tasks are stored under tasks/<taskId>; we don't have a direct lookup, so
  // we scan threads. Phase 11 will add an index. For v1 fan-out is fine.
  const threads = await rt.threads.list();
  for (const t of threads) {
    const got = await rt.tasks.get(t.id, taskId);
    if (got) return { task: got, threadId: t.id };
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

export function registerTaskRoutes(app: FastifyInstance, deps: Deps): void {
  app.get<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId',
    async (req, reply) => {
      const h = await loadTask(deps.rt, req.params.taskId);
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
      const h = await loadTask(deps.rt, req.params.taskId);
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

  action('/api/tasks/:taskId/skip', async ({ handle, req }) => {
    await pushControlSignal(
      deps.rt,
      handle.threadId,
      handle.task,
      'skip',
      req.auth!.user.id,
    );
    return { task: handle.task };
  });

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
      const h = await loadTask(deps.rt, req.params.taskId);
      if (!h) return reply.code(404).send({ error: { code: 'not_found' } });
      if (!ownerCheck(req, h.task, reply)) return;
      const events = await deps.rt.tasks.readEventsSince(
        h.threadId,
        h.task.id,
      );
      const entries = events
        .filter((e) =>
          ['task_retry_scheduled', 'task_retry_started', 'task_retry_exhausted', 'task_manual_retry_requested'].includes(
            e.kind,
          ),
        )
        .map((e) => ({
          eventId: e.id,
          at: e.at,
          attemptCount: (e.payload['attemptCount'] as number) ?? 0,
          failureClass: e.payload['failureClass'] as string | undefined,
          summary: (e.payload['summary'] as string) ?? '',
        }));
      return { taskId: h.task.id, entries };
    },
  );

  app.get<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId/plans',
    async (req, reply) => {
      const h = await loadTask(deps.rt, req.params.taskId);
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
      const h = await loadTask(deps.rt, req.params.taskId);
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
        const h = await loadTask(deps.rt, req.params.taskId);
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
