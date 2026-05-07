import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import type { RuntimePaths } from '../../runtime/paths.js';
import type { TaskIndex } from '../../runtime/task-index.js';

interface Deps {
  rt: RuntimePaths;
  taskIndex: TaskIndex;
}

async function loadTaskOwnerThread(
  deps: Deps,
  taskId: string,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<{ threadId: string; ownerOk: boolean } | undefined> {
  const indexed = deps.taskIndex.threadFor(taskId);
  if (indexed) {
    const got = await deps.rt.tasks.get(indexed, taskId);
    if (got) {
      if (got.ownerUserId !== req.auth!.user.id) {
        reply.code(403).send({ error: { code: 'forbidden' } });
        return { threadId: indexed, ownerOk: false };
      }
      return { threadId: indexed, ownerOk: true };
    }
  }
  const threads = await deps.rt.threads.list();
  for (const t of threads) {
    const got = await deps.rt.tasks.get(t.id, taskId);
    if (!got) continue;
    await deps.taskIndex.note(taskId, t.id);
    if (got.ownerUserId !== req.auth!.user.id) {
      reply.code(403).send({ error: { code: 'forbidden' } });
      return { threadId: t.id, ownerOk: false };
    }
    return { threadId: t.id, ownerOk: true };
  }
  reply.code(404).send({ error: { code: 'not_found' } });
  return undefined;
}

export function registerTeamRoutes(
  app: FastifyInstance,
  deps: Deps,
): void {
  app.get<{ Params: { taskId: string } }>(
    '/api/tasks/:taskId/teams',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      const teams = await deps.rt.teams.listTeamsForTask(r.threadId, req.params.taskId);
      return { teams };
    },
  );

  app.get<{ Params: { taskId: string; teamId: string } }>(
    '/api/tasks/:taskId/teams/:teamId',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      const team = await deps.rt.teams.getTeam(r.threadId, req.params.taskId, req.params.teamId);
      if (!team) return reply.code(404).send({ error: { code: 'not_found' } });
      return { team };
    },
  );

  app.get<{ Params: { taskId: string; teamId: string } }>(
    '/api/tasks/:taskId/teams/:teamId/work-items',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      const buckets = ['available', 'claimed', 'completed', 'failed', 'cancelled'] as const;
      const out = (
        await Promise.all(
          buckets.map((b) =>
            deps.rt.teams.listWorkItems(r.threadId, req.params.taskId, req.params.teamId, b),
          ),
        )
      ).flat();
      return { workItems: out };
    },
  );

  app.get<{ Params: { taskId: string; teamId: string } }>(
    '/api/tasks/:taskId/teams/:teamId/messages',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      const messages = await deps.rt.teams.readTeamMessages(r.threadId, req.params.taskId, req.params.teamId);
      return { messages };
    },
  );

  app.get<{ Params: { taskId: string; teamId: string } }>(
    '/api/tasks/:taskId/teams/:teamId/teammates',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      const teammates = await deps.rt.teams.listTeammates(r.threadId, req.params.taskId, req.params.teamId);
      return { teammates };
    },
  );

  app.get<{
    Params: { taskId: string; teamId: string; teammateId: string };
  }>(
    '/api/tasks/:taskId/teams/:teamId/teammates/:teammateId/events',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      // Phase 9 wires real events.
      void req.params.teammateId;
      return { events: [] };
    },
  );

  app.get<{ Params: { taskId: string; teamId: string } }>(
    '/api/tasks/:taskId/teams/:teamId/events',
    async (req, reply) => {
      const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
      if (!r || !r.ownerOk) return;
      const events = await deps.rt.teams.readTeamEvents(r.threadId, req.params.taskId, req.params.teamId);
      return { events };
    },
  );

  app.get<{ Params: { taskId: string; teamId: string } }>(
    '/api/tasks/:taskId/teams/:teamId/recovery-log',
    async () => {
      // Phase 9 will populate this from team-specific recovery diagnostics.
      return { entries: [] };
    },
  );

  for (const verb of ['cancel'] as const) {
    app.post<{ Params: { taskId: string; teamId: string } }>(
      `/api/tasks/:taskId/teams/:teamId/${verb}`,
      async (req, reply) => {
        const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
        if (!r || !r.ownerOk) return;
        const team = await deps.rt.teams.getTeam(r.threadId, req.params.taskId, req.params.teamId);
        if (!team) return reply.code(404).send({ error: { code: 'not_found' } });
        await deps.rt.teams.saveTeam({ ...team, status: 'cancelled' });
        return { ok: true };
      },
    );
  }

  for (const decision of ['approve', 'reject'] as const) {
    app.post<{
      Params: { taskId: string; teamId: string; teammateId: string };
    }>(
      `/api/tasks/:taskId/teams/:teamId/teammates/:teammateId/${decision}`,
      async (req, reply) => {
        const r = await loadTaskOwnerThread(deps, req.params.taskId, req, reply);
        if (!r || !r.ownerOk) return;
        // Phase 9 wires the teammate critical-node decision; v1 boundary acks.
        return { ok: true };
      },
    );
  }
}
