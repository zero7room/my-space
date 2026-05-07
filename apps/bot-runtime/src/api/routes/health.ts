import type { FastifyInstance } from 'fastify';

import { API_ROUTES, type RuntimeHealthResponse } from '@ai-workflow/contracts';
import type { InstanceLockHolder } from '@ai-workflow/fs-store';

import type { RuntimePaths } from '../../runtime/paths.js';
import { RuntimeMetrics } from '../../metrics/index.js';

interface Deps {
  rt: RuntimePaths;
  lock?: InstanceLockHolder;
  startedAt: string;
  metrics?: RuntimeMetrics;
}

export function registerHealthRoutes(app: FastifyInstance, deps: Deps): void {
  const metrics = deps.metrics ?? new RuntimeMetrics();
  app.get(API_ROUTES.runtime.health, async (_req, _reply) => {
    const start = Date.parse(deps.startedAt);
    const pendingOutboundJobs = (await deps.rt.channelJobs.list('pending')).length;
    const body: RuntimeHealthResponse = {
      runtimeId: deps.rt.paths.runtimeId,
      startedAt: deps.startedAt,
      uptimeMs: Date.now() - start,
      activeTaskCount: 0,
      pendingOutboundJobs,
    };
    return body;
  });

  app.get(API_ROUTES.runtime.metrics, async (_req, reply) => {
    reply.header('content-type', 'text/plain; version=0.0.4');
    return metrics.scrape();
  });
}
