import type { FastifyInstance } from 'fastify';

import {
  API_ROUTES,
  type CreateThreadRequest,
  type PostMessageRequest,
  type ThreadDto,
  createThreadRequestSchema,
  newEventId,
  newThreadId,
  newTaskListId,
  newMessageId,
  newPlanRevisionId,
  postMessageRequestSchema,
  ackRequestSchema,
  type EventEnvelope,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../../runtime/paths.js';
import type { SseRegistry } from '../../runtime/sse/index.js';
import type { TaskIndex } from '../../runtime/task-index.js';
import {
  resolveLlmGuardAdapter,
  type ChatModelAdapter,
} from '../../thread-loop/llm-factory.js';
import { MessageGuard, TaskDraftService } from '../../thread-loop/index.js';

interface Deps {
  rt: RuntimePaths;
  sse: SseRegistry;
  taskIndex: TaskIndex;
  chatModel: ChatModelAdapter;
}

function nextSseSeq(sse: SseRegistry, threadId: string): number {
  return (sse.forThread(threadId).bufferTail()?.seq ?? -1) + 1;
}

function publishThreadEvent(
  deps: Deps,
  threadId: string,
  kind: 'message_appended' | 'guard_decision_recorded',
  payload: Record<string, unknown>,
  at: string,
): EventEnvelope {
  const ev: EventEnvelope = {
    id: newEventId(),
    seq: nextSseSeq(deps.sse, threadId),
    kind,
    threadId,
    payload,
    at,
  };
  deps.sse.publish(ev);
  return ev;
}

function titleFromText(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 72 ? `${oneLine.slice(0, 69)}...` : oneLine || '新任务';
}

function assistantReplyForIntent(intent: string): string {
  switch (intent) {
    case 'progress_query':
      return '已收到。当前会话还没有可汇报的运行中任务。';
    case 'cancel_task':
    case 'pause_task':
    case 'resume_task':
      return '已收到控制请求。当前聊天入口还没有绑定到可操作的活动任务。';
    default:
      return '模型暂不可用，我已记录你的消息。';
  }
}

const STALE_ASSISTANT_REPLIES = new Set([
  '已收到，我会继续跟进。',
  '模型暂不可用，我已记录你的消息。',
]);

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
    const guard = new MessageGuard(resolveLlmGuardAdapter());
    const decision = await guard.classify({
      threadId: thread.id,
      messageId: id,
      fromUserId: req.auth!.user.id,
      source: 'client',
      text: parsed.data.text,
      bound: true,
      isOwner: true,
      hasPendingConfirmation: thread.status === 'waiting_confirmation',
    });
    await deps.rt.threads.appendGuardDecision(decision);
    publishThreadEvent(
      deps,
      thread.id,
      'guard_decision_recorded',
      {
        messageId: id,
        guardDecisionId: decision.id,
        intent: decision.intent,
        shortCircuited: decision.shortCircuited,
        confidence: decision.confidence,
        ruleHits: decision.ruleHits,
        reason: decision.reason,
      },
      now,
    );

    if (decision.intent === 'new_task' || decision.intent === 'plan_update') {
      const drafts = new TaskDraftService(deps.rt);
      const draft = await drafts.createDraftTask({
        threadId: thread.id,
        ownerUserId: req.auth!.user.id,
        title: titleFromText(parsed.data.text),
        description: parsed.data.text,
        sourceMessageIds: [id],
      });
      await deps.taskIndex.note(draft.id, thread.id);
      const revisionId = newPlanRevisionId();
      const plan = await drafts.createDraftPlan(thread.id, draft.id, {
        taskId: draft.id,
        status: 'pending_confirmation',
        objective: parsed.data.text,
        steps: [
          {
            id: newEventId(),
            title: '确认目标与范围',
            description: parsed.data.text,
            status: 'pending',
          },
          {
            id: newEventId(),
            title: '执行任务并产出结果',
            status: 'pending',
          },
        ],
        expectedArtifacts: [],
        revisionIds: [revisionId],
      });
      await deps.rt.planRevisions.save(thread.id, {
        id: revisionId,
        planId: plan.id,
        taskId: draft.id,
        status: 'active',
        fullPlan: plan,
        reason: 'initial task draft from user message',
        sourceMessageId: id,
        archivedArtifactPaths: [],
        createdAt: now,
      });
      const taskEvent = await deps.rt.tasks.appendEvent(thread.id, draft.id, {
        kind: 'task_drafted',
        taskId: draft.id,
        threadId: thread.id,
        payload: { messageId: id },
        at: now,
      });
      deps.sse.publish(taskEvent);
      const planEvent = await deps.rt.tasks.appendEvent(thread.id, draft.id, {
        kind: 'plan_drafted',
        taskId: draft.id,
        threadId: thread.id,
        payload: { revisionId, planId: plan.id, autoConfirm: false },
        at: now,
      });
      deps.sse.publish(planEvent);
      return { messageId: id, guardDecision: decision, draftTaskId: draft.id };
    }

    const assistantId = newMessageId();
    const transcript = await deps.rt.threads.readTranscript(thread.id);
    const modelText = await deps.chatModel.generateReply({
      threadId: thread.id,
      messages: transcript
        .filter((m) => m.source === 'client' || m.source === 'assistant')
        .filter((m) => !STALE_ASSISTANT_REPLIES.has(m.text.trim()))
        .slice(-12)
        .map((m) => ({
          role: m.source === 'assistant' ? 'assistant' as const : 'user' as const,
          content: m.text,
        })),
    });
    const assistantText = modelText ?? assistantReplyForIntent(decision.intent);
    await deps.rt.threads.appendTranscript(thread.id, {
      id: assistantId,
      threadId: thread.id,
      source: 'assistant',
      text: assistantText,
      at: now,
    });
    publishThreadEvent(
      deps,
      thread.id,
      'message_appended',
      {
        messageId: assistantId,
        role: 'assistant',
        text: assistantText,
        at: now,
      },
      now,
    );
    return { messageId: id, guardDecision: decision };
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

      reply.raw.statusCode = 200;
      const origin = req.headers.origin;
      if (typeof origin === 'string') {
        // This raw SSE response bypasses Fastify's normal header flush path, so
        // mirror the global CORS policy here for browser clients.
        reply.raw.setHeader('Access-Control-Allow-Origin', origin);
        reply.raw.setHeader('Vary', 'Origin');
      }
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
      reply.raw.setHeader('Connection', 'keep-alive');
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
      const t = await deps.rt.threads.get(req.params.threadId);
      if (!t || t.ownerUserId !== req.auth!.user.id) {
        reply.code(403);
        return { error: { code: 'forbidden', message: 'not owner' } };
      }
      // Best-effort: parse the seq off the lastEventId tail. Client-supplied
      // ids carry no seq directly; we trust a numeric `seq` query param if
      // present, else look it up in the buffer.
      const seqParam = (req.query as Record<string, unknown> | undefined)?.['seq'];
      let lastSeq: number | undefined;
      if (typeof seqParam === 'string') lastSeq = Number.parseInt(seqParam, 10);
      if (lastSeq === undefined || Number.isNaN(lastSeq)) {
        const tail = deps.sse.forThread(t.id).bufferTail();
        if (tail) lastSeq = tail.seq;
      }
      const subId = req.headers['x-sse-subscriber-id'] as string | undefined;
      if (subId && typeof lastSeq === 'number') {
        deps.sse.forThread(t.id).noteAck(subId, lastSeq);
      }
      return { ok: true, ackedSeq: lastSeq };
    },
  );
}
