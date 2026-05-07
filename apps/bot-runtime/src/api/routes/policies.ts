import type { FastifyInstance } from 'fastify';

import {
  createPolicyRequestSchema,
  newPolicyId,
  type CriticalNodePolicy,
  updatePolicyRequestSchema,
  criticalNodePolicySchema,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../../runtime/paths.js';

export function registerPolicyRoutes(
  app: FastifyInstance,
  deps: { rt: RuntimePaths },
): void {
  app.get('/api/critical-node-policies', async () => {
    const policies = await deps.rt.policies.list();
    return { policies };
  });

  app.post('/api/critical-node-policies', async (req, reply) => {
    const parsed = createPolicyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: parsed.error.message },
      });
    }
    const now = new Date().toISOString();
    const id = newPolicyId();
    const policy = criticalNodePolicySchema.parse({
      ...parsed.data,
      id,
      createdAt: now,
      ownerUserId: req.auth!.user.id,
    });
    await deps.rt.policies.save(policy);
    return { policy };
  });

  app.patch<{ Params: { policyId: string } }>(
    '/api/critical-node-policies/:policyId',
    async (req, reply) => {
      const parsed = updatePolicyRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'bad_request', message: parsed.error.message },
        });
      }
      const cur = await deps.rt.policies.get(req.params.policyId);
      if (!cur)
        return reply.code(404).send({ error: { code: 'not_found' } });
      if (cur.ownerUserId !== req.auth!.user.id) {
        return reply.code(403).send({ error: { code: 'forbidden' } });
      }
      const next: CriticalNodePolicy = { ...cur, ...parsed.data };
      const validated = criticalNodePolicySchema.parse(next);
      await deps.rt.policies.save(validated);
      return { policy: validated };
    },
  );

  app.delete<{ Params: { policyId: string } }>(
    '/api/critical-node-policies/:policyId',
    async (req, reply) => {
      const cur = await deps.rt.policies.get(req.params.policyId);
      if (!cur)
        return reply.code(404).send({ error: { code: 'not_found' } });
      if (cur.ownerUserId !== req.auth!.user.id) {
        return reply.code(403).send({ error: { code: 'forbidden' } });
      }
      await deps.rt.policies.delete(req.params.policyId);
      return { ok: true };
    },
  );
}
