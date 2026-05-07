import type { FastifyInstance } from 'fastify';

import type { RuntimePaths } from '../../runtime/paths.js';

export function registerArtifactRoutes(
  app: FastifyInstance,
  deps: { rt: RuntimePaths },
): void {
  app.get<{ Params: { artifactId: string } }>(
    '/api/artifacts/:artifactId',
    async (req, reply) => {
      const threads = await deps.rt.threads.list();
      for (const t of threads) {
        const tasks = await deps.rt.tasks.listForThread(t.id);
        for (const tk of tasks) {
          if (!tk.artifactIds.includes(req.params.artifactId)) continue;
          if (tk.ownerUserId !== req.auth!.user.id) {
            return reply.code(403).send({ error: { code: 'forbidden' } });
          }
          const art = await deps.rt.artifacts.get(
            t.id,
            tk.id,
            req.params.artifactId,
          );
          if (!art) return reply.code(404).send({ error: { code: 'not_found' } });
          return { artifact: art };
        }
      }
      return reply.code(404).send({ error: { code: 'not_found' } });
    },
  );

  app.post<{ Params: { artifactId: string } }>(
    '/api/artifacts/:artifactId/reseal',
    async (_req, _reply) => {
      // Phase 6 ties this to executor reseal; v1 boundary is a noop ack.
      return { ok: true };
    },
  );
}
