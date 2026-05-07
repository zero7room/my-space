import type { FastifyInstance } from 'fastify';

import {
  API_ROUTES,
  type CreateThreadRequest,
  type PostMessageRequest,
  type ThreadDto,
  createThreadRequestSchema,
  newThreadId,
  newTaskListId,
  newMessageId,
  postMessageRequestSchema,
  ackRequestSchema,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../../runtime/paths.js';
import type { SseRegistry } from '../../runtime/sse/index.js';

interface Deps {
  rt: RuntimePaths;
  sse: SseRegistry;
}

export function registerThreadRoutes(app: FastifyInstance, deps: Deps): void {
  app.get(API_ROUTES.threads.list, async (req) => {
    const all = await deps.rt.threads.list();
    const mine = all.filter((t) => t.ownerUserId === req.auth!.user.id);
    const threads: ThreadDto[] = mine.map((t) => ({ ...t, unreadCount: 0 }));
    return { threads };
  });

  app.post(API_ROUTES.threads.create, async (req, reply) => {
    const body = createThreadRequestSchema.safeParse(req.body);
    if (!body.success) {
      reply.code(400);
      return {
        error: { code: 'bad_request', message: body.error.message },
      };
    }
    const data: CreateThreadRequest = body.data;
    const now = new Date().toISOString();
    const id = newThreadId();
    const thread = await deps.rt.threads.create({
      id,
      ownerUserId: req.auth!.user.id,
      title: data.title ?? 'New thread',
      status: 'idle',
      taskListId: newTaskListId(),
      channelBindingIds: [],
      createdAt: now,
      updatedAt: now,
    });
    if (data.initialMessage) {
      await deps.rt.threads.appendTranscript(id, {
        id: newMessageId(),
        threadId: id,
        fromUserId: req.auth!.user.id,
        source: 'client',
        text: data.initialMessage,
        at: now,
      });
    }
    return { thread };
  });

  app.get<{ Params: { threadId: string } }>(
    '/api/threads/:threadId',
    async (req, reply) => {
      const t = await deps.rt.threads.get(req.params.threadId);
      if (!t) {
        reply.code(404);
        return { error: { code: 'not_found', message: 'thread not found' } };
      }
      if (t.ownerUserId !== req.auth!.user.id) {
        reply.code(403);
        return { error: { code: 'forbidden', message: 'not owner' } };
      }
      return { thread: t };
    },
  );

  app.post<{
    Params: { threadId: string };
    Body: PostMessageRequest;
  }>('/api/threads/:threadId/messages', async (req, reply) => {
    const parsed = postMessageRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      reply.code(400);
      return { error: { code: 'bad_request', message: parsed.error.message } };
    }
    const thread = await deps.rt.threads.get(req.params.threadId);
    if (!thread || thread.ownerUserId !== req.auth!.user.id) {
      reply.code(403);
      return { error: { code: 'forbidden', message: 'not owner' } };
    }
    const id = newMessageId();
    const now = new Date().toISOString();
    await deps.rt.threads.appendTranscript(thread.id, {
      id,
      threadId: thread.id,
      fromUserId: req.auth!.user.id,
      source: 'client',
      text: parsed.data.text,
      at: now,
      clientMessageId: parsed.data.clientMessageId,
    });
    return { messageId: id };
  });

  app.get<{ Params: { threadId: string }; Querystring: { since?: string } }>(
    '/api/threads/:threadId/events',
    async (req, reply) => {
      const t = await deps.rt.threads.get(req.params.threadId);
      if (!t || t.ownerUserId !== req.auth!.user.id) {
        reply.code(403);
        return reply.send({
          error: { code: 'forbidden', message: 'not owner' },
        });
      }

      const sinceSeq = req.query.since
        ? Number.parseInt(req.query.since, 10)
        : undefined;

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      });
      reply.raw.write(': ok\n\n');

      const ac = new AbortController();
      req.raw.on('close', () => ac.abort());

      const bus = deps.sse.forThread(t.id);
      try {
        for await (const ev of bus.subscribe({
          sinceSeq,
          signal: ac.signal,
        })) {
          reply.raw.write(`id: ${ev.seq}\n`);
          reply.raw.write(`event: ${ev.kind}\n`);
          reply.raw.write(`data: ${JSON.stringify(ev)}\n\n`);
        }
      } catch (err) {
        req.log.warn({ err }, 'sse stream error');
      } finally {
        try {
          reply.raw.end();
        } catch {
          /* noop */
        }
      }
      // Returning undefined keeps Fastify from serializing again.
      return reply;
    },
  );

  app.post<{ Params: { threadId: string } }>(
    '/api/threads/:threadId/ack',
    async (req, reply) => {
      const parsed = ackRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        reply.code(400);
        return { error: { code: 'bad_request', message: parsed.error.message } };
      }
      // v1 ack is informational; SSE replay is driven by `since` query.
      return { ok: true };
    },
  );
}
