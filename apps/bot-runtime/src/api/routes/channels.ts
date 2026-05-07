import type { FastifyInstance } from 'fastify';

import {
  type ChannelConfigView,
  channelConfigSchema,
  createChannelBindingRequestSchema,
  newBindingId,
  putChannelConfigRequestSchema,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../../runtime/paths.js';

function viewOf(c: import('@ai-workflow/contracts').ChannelConfig): ChannelConfigView {
  const hasSecret: Record<string, boolean> = {};
  for (const k of Object.keys(c.secretRefs)) hasSecret[k] = true;
  return {
    provider: c.provider,
    enabled: c.enabled,
    ingress: { ...c.ingress },
    publicFields: c.publicFields,
    hasSecret,
    updatedAt: c.updatedAt,
  };
}

export function registerChannelRoutes(
  app: FastifyInstance,
  deps: { rt: RuntimePaths },
): void {
  app.get('/api/channels/configs', async () => {
    const all = await deps.rt.channelConfigs.list();
    return { configs: all.map(viewOf) };
  });

  app.put<{ Params: { provider: string } }>(
    '/api/channels/configs/:provider',
    async (req, reply) => {
      const parsed = putChannelConfigRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'bad_request', message: parsed.error.message },
        });
      }
      const now = new Date().toISOString();
      const existing = await deps.rt.channelConfigs.get(req.params.provider);
      const merged = channelConfigSchema.parse({
        provider: req.params.provider,
        enabled: parsed.data.enabled,
        ingress: parsed.data.ingress,
        publicFields: parsed.data.publicFields,
        secretRefs:
          parsed.data.secretInputs && Object.keys(parsed.data.secretInputs).length > 0
            ? Object.fromEntries(
                Object.entries(parsed.data.secretInputs).map(([k]) => [k, '<set>']),
              )
            : (existing?.secretRefs ?? {}),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
      await deps.rt.channelConfigs.save(merged);
      return { config: viewOf(merged) };
    },
  );

  app.get('/api/channels/bindings', async (req) => {
    const threads = await deps.rt.threads.list();
    const mine = threads.filter((t) => t.ownerUserId === req.auth!.user.id);
    const bindings = (
      await Promise.all(mine.map((t) => deps.rt.channelBindings.listForThread(t.id)))
    ).flat();
    return { bindings };
  });

  app.post('/api/channels/bindings', async (req, reply) => {
    const parsed = createChannelBindingRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: { code: 'bad_request', message: parsed.error.message },
      });
    }
    const t = await deps.rt.threads.get(parsed.data.threadId);
    if (!t || t.ownerUserId !== req.auth!.user.id) {
      return reply.code(403).send({ error: { code: 'forbidden' } });
    }
    const now = new Date().toISOString();
    const id = newBindingId();
    const binding = await deps.rt.channelBindings.save({
      id,
      threadId: t.id,
      provider: parsed.data.provider,
      externalConversationId: parsed.data.externalConversationId,
      externalConversationType: parsed.data.externalConversationType,
      status: 'binding',
      createdBy: 'client',
      enabled: true,
      notifyDefault: parsed.data.notifyDefault,
      createdAt: now,
      updatedAt: now,
    });
    return { binding };
  });

  app.delete<{ Params: { bindingId: string } }>(
    '/api/channels/bindings/:bindingId',
    async (req, _reply) => {
      // Phase 8 ties this to ChannelProvider unbind; v1 boundary marks the
      // binding disabled if found.
      const threads = await deps.rt.threads.list();
      for (const t of threads) {
        const bindings = await deps.rt.channelBindings.listForThread(t.id);
        const found = bindings.find((b) => b.id === req.params.bindingId);
        if (!found) continue;
        if (t.ownerUserId !== req.auth!.user.id) {
          return _reply.code(403).send({ error: { code: 'forbidden' } });
        }
        await deps.rt.channelBindings.save({
          ...found,
          enabled: false,
          status: 'disabled',
          updatedAt: new Date().toISOString(),
        });
        return { ok: true };
      }
      return _reply.code(404).send({ error: { code: 'not_found' } });
    },
  );

  // Webhook: bypassed by auth preHandler. Feishu HMAC verify when configured.
  app.post('/api/channels/feishu/webhook', async (req, reply) => {
    const cfg = await deps.rt.channelConfigs.get('feishu');
    const encryptKey = cfg?.secretRefs['encryptKey'];
    const verificationToken = (cfg?.publicFields['verificationToken'] as string | undefined);
    const provider = new (await import('../../channels/feishu.js')).FeishuProvider({
      verificationToken,
      encryptKey,
    });
    const sig = (req.headers['x-lark-signature'] ?? req.headers['x-lark-request-signature']) as
      | string
      | undefined;
    const ts = (req.headers['x-lark-request-timestamp'] ?? req.headers['x-lark-timestamp']) as
      | string
      | undefined;
    const out = await provider.handleInbound({
      body: req.body,
      signatureHeader: sig,
      timestampHeader: ts,
      rawBody: Buffer.from(JSON.stringify(req.body ?? {})),
    });
    if (!out.signatureValid) {
      return reply.code(401).send({ error: { code: 'unauthorized' } });
    }
    if (out.event) {
      // Idempotency: first-write-wins via repo.
      const existing = await deps.rt.channelEvents.get(
        out.event.provider,
        out.event.externalEventId,
      );
      if (!existing) {
        await deps.rt.channelEvents.record(out.event);
      }
    }
    return { ok: true };
  });
}
