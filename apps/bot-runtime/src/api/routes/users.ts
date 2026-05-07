import type { FastifyInstance } from 'fastify';

import { API_ROUTES } from '@ai-workflow/contracts';

export function registerUserRoutes(app: FastifyInstance): void {
  app.get(API_ROUTES.user.me, async (req) => ({ user: req.auth!.user }));
}
