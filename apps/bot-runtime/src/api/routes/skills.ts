import type { FastifyInstance } from 'fastify';

import type { RuntimePaths } from '../../runtime/paths.js';

export function registerSkillRoutes(
  app: FastifyInstance,
  _deps: { rt: RuntimePaths },
): void {
  // Phase 6 will load skills and populate this from a SkillRegistry instance.
  app.get('/api/skills/load-status', async () => {
    return { loaded: [], errors: [] };
  });
}
