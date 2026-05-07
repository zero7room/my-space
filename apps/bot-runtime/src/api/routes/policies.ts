import type { FastifyInstance } from 'fastify';

import {
  createPolicyRequestSchema,
  newPolicyId,
  type CriticalNodePolicy,
  updatePolicyRequestSchema,
  criticalNodePolicySchema,
} from '@ai-workflow/contracts';

import type { CriticalNodePolicyEngine } from '../../critical-node/index.js';
import type { RuntimePaths } from '../../runtime/paths.js';

interface PolicyDeps {
  rt: RuntimePaths;
  /**
   * Optional in-memory engine to keep in sync with the on-disk repo. When
   * provided, every CRUD action triggers `engine.setPolicies(await
   * rt.policies.list())` so new policies take effect on the next tool dispatch
   * without a runtime restart (acceptance #12).
   */
  engine?: CriticalNodePolicyEngine;
}

async function reloadEngine(deps: PolicyDeps): Promise<void> {
  if (!deps.engine) return;
  const all = await deps.rt.policies.list();
  deps.engine.setPolicies(all);
}

export function registerPolicyRoutes(
  app: FastifyInstance,
  deps: PolicyDeps,
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
    await reloadEngine(deps);
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
      await reloadEngine(deps);
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
      await reloadEngine(deps);
      return { ok: true };
    },
  );
}
