/**
 * Thin API client for the bot-runtime. Reads token from `NEXT_PUBLIC_BEARER`
 * (dev only — production should resolve via session cookie).
 */
import { API_ROUTES } from '@ai-workflow/contracts';
import type {
  ChannelBindingListResponse,
  PolicyListResponse,
  ThreadListResponse,
  ThreadDto,
} from '@ai-workflow/contracts';

const BASE = process.env['NEXT_PUBLIC_RUNTIME_URL'] ?? 'http://localhost:4000';

function token(): string {
  return process.env['NEXT_PUBLIC_BEARER'] ?? '';
}

async function get<T>(p: string): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    headers: { authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(p: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token()}`,
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listThreads: () => get<ThreadListResponse>(API_ROUTES.threads.list),
  createThread: (body: { title?: string; initialMessage?: string }) =>
    post<{ thread: ThreadDto }>(API_ROUTES.threads.create, body),
  postMessage: (threadId: string, text: string) =>
    post(API_ROUTES.threads.postMessage(threadId), { text }),
  listPolicies: () => get<PolicyListResponse>(API_ROUTES.criticalNodePolicies.list),
  listChannelBindings: () =>
    get<ChannelBindingListResponse>(API_ROUTES.channels.listBindings),
};
