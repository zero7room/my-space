import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { newUserId } from '@ai-workflow/contracts';

import { createServer } from '../server.js';

const RUNTIME_ID = 'rt-test-api';
const ALICE_TOKEN = 'alice-dev-token';

async function bootServer() {
  const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
  const handle = await createServer({
    workspaceRoot: ws,
    runtimeId: RUNTIME_ID,
    localUserTokens: '', // we'll seed users + tokens below
  });
  return { handle, ws };
}

describe('Fastify API smoke', () => {
  it('responds 401 without auth and 200 on /api/users/me with a valid bearer', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
    });
    try {
      // Seed Alice in the user repo so the token resolves.
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'alice@example.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const noAuth = await handle.app.inject({ method: 'GET', url: '/api/users/me' });
      expect(noAuth.statusCode).toBe(401);

      const ok = await handle.app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.json().user.id).toBe(aliceId);
    } finally {
      await handle.close();
    }
  });

  it('health endpoint requires no auth', async () => {
    const { handle } = await bootServer();
    try {
      const res = await handle.app.inject({
        method: 'GET',
        url: '/api/runtime/health',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().runtimeId).toBe(RUNTIME_ID);
    } finally {
      await handle.close();
    }
  });

  it('rejects unknown bearer token', async () => {
    const { handle } = await bootServer();
    try {
      const res = await handle.app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { authorization: 'Bearer not-a-token' },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await handle.close();
    }
  });

  it('end-to-end: create thread, post message, list threads', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
    });
    try {
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'a@x.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { title: 'design review', initialMessage: 'hi' },
      });
      expect(created.statusCode).toBe(200);
      const threadId = created.json().thread.id as string;

      const list = await handle.app.inject({
        method: 'GET',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().threads).toHaveLength(1);

      const post = await handle.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/messages`,
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { text: 'second message' },
      });
      expect(post.statusCode).toBe(200);
      expect(typeof post.json().messageId).toBe('string');
    } finally {
      await handle.close();
    }
  });

  it('owner-first: another user cannot access my thread', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const bobId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:alice-tok,${bobId}:bob-tok`,
    });
    try {
      const now = new Date().toISOString();
      for (const id of [aliceId, bobId]) {
        await handle.rt.users.upsert({
          id,
          displayName: id,
          channelIdentities: { email: `${id}@x.com` },
          createdAt: now,
          updatedAt: now,
        });
      }
      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: 'Bearer alice-tok' },
        payload: { title: 'private' },
      });
      const threadId = created.json().thread.id;

      const bobAttempt = await handle.app.inject({
        method: 'GET',
        url: `/api/threads/${threadId}`,
        headers: { authorization: 'Bearer bob-tok' },
      });
      expect(bobAttempt.statusCode).toBe(403);
    } finally {
      await handle.close();
    }
  });

  it('preserves CORS headers on thread SSE responses', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
      skipLock: true,
    });
    try {
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'alice@example.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { title: 'sse cors' },
      });
      expect(created.statusCode).toBe(200);
      const threadId = created.json().thread.id as string;

      await handle.app.listen({ port: 0, host: '127.0.0.1' });
      const address = handle.app.server.address() as AddressInfo;
      const res = await new Promise<http.IncomingMessage>((resolve, reject) => {
        const req = http.get(
          {
            hostname: '127.0.0.1',
            port: address.port,
            path: `/api/threads/${threadId}/events`,
            headers: {
              authorization: `Bearer ${ALICE_TOKEN}`,
              origin: 'http://localhost:3000',
            },
          },
          (incoming) => {
            resolve(incoming);
            incoming.destroy();
            req.destroy();
          },
        );
        req.on('error', reject);
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
    } finally {
      await handle.close();
    }
  });

  it('classifies chat messages and emits an assistant reply over SSE', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
      skipLock: true,
      chatModel: {
        generateReply: async () => '你好，我在。你想让我帮你做什么？',
      },
    });
    try {
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'alice@example.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { title: 'chat' },
      });
      const threadId = created.json().thread.id as string;

      const posted = await handle.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/messages`,
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { text: 'lunch was nice today' },
      });

      expect(posted.statusCode).toBe(200);
      expect(handle.sse.forThread(threadId).bufferLength()).toBe(2);
      const tail = handle.sse.forThread(threadId).bufferTail();
      expect(tail?.kind).toBe('message_appended');
      expect(tail?.payload['role']).toBe('assistant');
      expect(tail?.payload['text']).toBe('你好，我在。你想让我帮你做什么？');
    } finally {
      await handle.close();
    }
  });

  it('does not feed stale fallback assistant replies back into the chat model', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    let modelMessages: Array<{ role: string; content: string }> = [];
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
      skipLock: true,
      chatModel: {
        generateReply: async (input) => {
          modelMessages = input.messages;
          return '你好，我在。';
        },
      },
    });
    try {
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'alice@example.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { title: 'stale context' },
      });
      const threadId = created.json().thread.id as string;
      await handle.rt.threads.appendTranscript(threadId, {
        id: 'ms_000000000000000000000',
        threadId,
        source: 'assistant',
        text: '已收到，我会继续跟进。',
        at: new Date().toISOString(),
      });

      const posted = await handle.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/messages`,
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { text: 'hi' },
      });

      expect(posted.statusCode).toBe(200);
      expect(modelMessages.map((m) => m.content)).not.toContain(
        '已收到，我会继续跟进。',
      );
    } finally {
      await handle.close();
    }
  });

  it('classifies task requests and emits draft task and plan events', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
      skipLock: true,
    });
    try {
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'alice@example.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { title: 'task' },
      });
      const threadId = created.json().thread.id as string;

      const posted = await handle.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/messages`,
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { text: 'please draft a launch plan' },
      });

      expect(posted.statusCode).toBe(200);
      expect(handle.sse.forThread(threadId).bufferLength()).toBe(3);
      const tail = handle.sse.forThread(threadId).bufferTail();
      expect(tail?.kind).toBe('plan_drafted');
      expect(typeof tail?.taskId).toBe('string');
      expect(typeof tail?.payload['revisionId']).toBe('string');

      const thread = await handle.rt.threads.get(threadId);
      expect(thread?.status).toBe('waiting_confirmation');
      expect(thread?.draftTaskId).toBe(tail?.taskId);
    } finally {
      await handle.close();
    }
  });

  it('accepts SSE ack payloads sent by the web client', async () => {
    const ws = mkdtempSync(path.join(tmpdir(), 'rt-api-'));
    const aliceId = newUserId();
    const handle = await createServer({
      workspaceRoot: ws,
      runtimeId: RUNTIME_ID,
      localUserTokens: `${aliceId}:${ALICE_TOKEN}`,
      skipLock: true,
    });
    try {
      await handle.rt.users.upsert({
        id: aliceId,
        displayName: 'Alice',
        channelIdentities: { email: 'alice@example.com' },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const created = await handle.app.inject({
        method: 'POST',
        url: '/api/threads',
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { title: 'ack' },
      });
      const threadId = created.json().thread.id as string;

      const ack = await handle.app.inject({
        method: 'POST',
        url: `/api/threads/${threadId}/ack`,
        headers: { authorization: `Bearer ${ALICE_TOKEN}` },
        payload: { cursor: 1, ackedAt: new Date().toISOString() },
      });

      expect(ack.statusCode).toBe(200);
      expect(ack.json().ok).toBe(true);
    } finally {
      await handle.close();
    }
  });
});

beforeAll(() => {
  // silence Fastify request logs in tests
  process.env['LOG_LEVEL'] = 'fatal';
  // Keep smoke tests deterministic even when the developer shell has real LLM
  // credentials loaded from .env.
  process.env['LLM_PROVIDER'] = 'heuristic';
  delete process.env['LLM_API_KEY'];
});
afterAll(() => {});
