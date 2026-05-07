import type { FastifyInstance } from 'fastify';

import type { RuntimePaths } from '../../runtime/paths.js';
import type { SkillRegistry, SkillStatus } from '../../skills/index.js';

export interface SkillRoutesDeps {
  rt: RuntimePaths;
  registry?: SkillRegistry;
}

export function registerSkillRoutes(
  app: FastifyInstance,
  deps: SkillRoutesDeps,
): void {
  // GET /api/skills/load-status — admin/visibility surface (acceptance #56).
  // Returns each known skill with its current source: disk | cache | failed,
  // plus the raw error list so operators can diagnose failures.
  app.get('/api/skills/load-status', async () => {
    if (!deps.registry) {
      const empty: { skills: SkillStatus[]; errors: never[] } = {
        skills: [],
        errors: [],
      };
      return empty;
    }
    const status = deps.registry.loadStatus();
    return {
      skills: status.statuses,
      errors: status.errors,
      fellBackTo: status.fellBackTo,
    };
  });
}
