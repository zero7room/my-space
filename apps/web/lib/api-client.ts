/**
 * Thin API client for the bot-runtime. Reads token from `NEXT_PUBLIC_BEARER`
 * (dev only — production should resolve via session cookie).
 */
import { API_ROUTES } from '@ai-workflow/contracts';
import type {
  ChannelBindingListResponse,
  PolicyListResponse,
  PlanListResponse,
  RetryHistoryResponse,
  TaskActionResponse,
  TeamListResponse,
  TeamMessagesResponse,
  TeamWorkItemsResponse,
  TeammatesResponse,
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

  getTask: (taskId: string) => get<TaskActionResponse>(API_ROUTES.tasks.get(taskId)),
  confirmTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.confirm(taskId)),
  cancelTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.cancel(taskId)),
  pauseTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.pause(taskId)),
  resumeTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.resume(taskId)),
  retryTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.retry(taskId)),
  retryHistory: (taskId: string) => get<RetryHistoryResponse>(API_ROUTES.tasks.retryHistory(taskId)),
  taskPlans: (taskId: string) => get<PlanListResponse>(API_ROUTES.tasks.plans(taskId)),

  listTeams: (taskId: string) => get<TeamListResponse>(API_ROUTES.teams.listForTask(taskId)),
  teamWorkItems: (taskId: string, teamId: string) =>
    get<TeamWorkItemsResponse>(API_ROUTES.teams.workItems(taskId, teamId)),
  teamMessages: (taskId: string, teamId: string) =>
    get<TeamMessagesResponse>(API_ROUTES.teams.messages(taskId, teamId)),
  teammates: (taskId: string, teamId: string) =>
    get<TeammatesResponse>(API_ROUTES.teams.teammates(taskId, teamId)),

  listPolicies: () => get<PolicyListResponse>(API_ROUTES.criticalNodePolicies.list),
  listChannelBindings: () =>
    get<ChannelBindingListResponse>(API_ROUTES.channels.listBindings),

  // --- P0-A additions ---
  // User
  me: () => get<{ user: unknown }>(API_ROUTES.user.me),
  // Task actions the existing client missed
  skipTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.skip(taskId)),
  rejectTask: (taskId: string) => post<TaskActionResponse>(API_ROUTES.tasks.reject(taskId)),
  approveCriticalNode: (taskId: string, body?: unknown) =>
    post<TaskActionResponse>(API_ROUTES.tasks.criticalNodeApprove(taskId), body),
  rejectCriticalNode: (taskId: string, body?: unknown) =>
    post<TaskActionResponse>(API_ROUTES.tasks.criticalNodeReject(taskId), body),
  confirmPlan: (taskId: string, revisionId: string) =>
    post<TaskActionResponse>(API_ROUTES.tasks.confirmPlan(taskId, revisionId)),
  rejectPlan: (taskId: string, revisionId: string) =>
    post<TaskActionResponse>(API_ROUTES.tasks.rejectPlan(taskId, revisionId)),
  getPlanRevision: (taskId: string, revisionId: string) =>
    get<unknown>(API_ROUTES.tasks.plan(taskId, revisionId)),
  // Channels
  listChannelConfigs: () => get<unknown>(API_ROUTES.channels.listConfigs),
  putChannelConfig: (provider: string, body: unknown) =>
    post<unknown>(API_ROUTES.channels.putConfig(provider), body),
  createBinding: (body: unknown) => post<unknown>(API_ROUTES.channels.createBinding, body),
  deleteBinding: (id: string) =>
    fetch(`${BASE}${API_ROUTES.channels.deleteBinding(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token()}` },
    }).then(() => undefined),
  // Artifacts
  getArtifact: (id: string) => get<unknown>(API_ROUTES.artifacts.get(id)),
  resealArtifact: (id: string) => post<unknown>(API_ROUTES.artifacts.reseal(id)),
  // Teams actions
  cancelTeam: (taskId: string, teamId: string) =>
    post<unknown>(API_ROUTES.teams.cancel(taskId, teamId)),
  approveTeammate: (taskId: string, teamId: string, teammateId: string) =>
    post<unknown>(API_ROUTES.teams.approveTeammate(taskId, teamId, teammateId)),
  rejectTeammate: (taskId: string, teamId: string, teammateId: string) =>
    post<unknown>(API_ROUTES.teams.rejectTeammate(taskId, teamId, teammateId)),
  teammateEvents: (taskId: string, teamId: string, teammateId: string) =>
    get<unknown>(API_ROUTES.teams.teammateEvents(taskId, teamId, teammateId)),
  teamEvents: (taskId: string, teamId: string) =>
    get<unknown>(API_ROUTES.teams.events(taskId, teamId)),
  recoveryLog: (taskId: string, teamId: string) =>
    get<unknown>(API_ROUTES.teams.recoveryLog(taskId, teamId)),
  // Policies
  createPolicy: (body: unknown) =>
    post<unknown>(API_ROUTES.criticalNodePolicies.create, body),
  updatePolicy: (id: string, body: unknown) =>
    post<unknown>(API_ROUTES.criticalNodePolicies.update(id), body),
  deletePolicy: (id: string) =>
    fetch(`${BASE}${API_ROUTES.criticalNodePolicies.delete(id)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token()}` },
    }).then(() => undefined),
};
