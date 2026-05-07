import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync } from 'node:fs';
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
});

beforeAll(() => {
  // silence Fastify request logs in tests
  process.env['LOG_LEVEL'] = 'fatal';
});
afterAll(() => {});
