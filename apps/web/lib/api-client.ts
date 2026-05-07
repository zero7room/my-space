/**
 * Thin API client for the bot-runtime. Reads token from `NEXT_PUBLIC_BEARER`
 * (dev only — production should resolve via session cookie).
 */
import { API_PREFIX, API_ROUTES } from '@ai-workflow/contracts';
import type {
  ArtifactGetResponse,
  ChannelBindingListResponse,
  ChannelConfigsResponse,
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

/**
 * Typed API error. Surfaces HTTP status, optional `reason` from the server's
 * `{ error: { reason, message } }` envelope, and the raw body for debugging.
 */
export class ApiError extends Error {
  status: number;
  reason?: string;
  details?: unknown;
  constructor(message: string, status: number, reason?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.reason = reason;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON or empty body */
  }
  const b = body as
    | {
        error?: { reason?: string; message?: string };
        reason?: string;
        message?: string;
      }
    | null;
  const reason = b?.error?.reason ?? b?.reason;
  const message =
    b?.error?.message ?? b?.message ?? `${res.status} ${res.statusText}`;
  return new ApiError(message, res.status, reason, body);
}

async function get<T>(p: string): Promise<T> {
  const res = await fetch(`${BASE}${p}`, {
    headers: { authorization: `Bearer ${token()}` },
    cache: 'no-store',
  });
  if (!res.ok) throw await parseError(res);
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
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

async function del(p: string): Promise<void> {
  const res = await fetch(`${BASE}${p}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token()}` },
  });
  if (!res.ok) throw await parseError(res);
}

// TODO: type when contract lands — PlanRevision response
type PlanRevisionLike = unknown;
// TODO: type when contract lands — ChangeRecord response
export type ChangeRecordEntry = {
  id: string;
  taskId?: string;
  revisionId?: string;
  kind?: string;
  summary?: string;
  reason?: string;
  at?: string;
  payload?: unknown;
};
export type ChangeRecordsResponse = { entries: ChangeRecordEntry[] };

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
    get<PlanRevisionLike>(API_ROUTES.tasks.plan(taskId, revisionId)),
  // ChangeRecord (best-effort; backend may not yet expose this route)
  changeRecords: async (taskId: string): Promise<ChangeRecordsResponse> => {
    try {
      const res = await fetch(`${BASE}${API_PREFIX}/tasks/${taskId}/change-records`, {
        headers: { authorization: `Bearer ${token()}` },
        cache: 'no-store',
      });
      if (res.status === 404) return { entries: [] };
      if (!res.ok) return { entries: [] };
      const body = (await res.json()) as ChangeRecordsResponse | { records?: ChangeRecordEntry[] };
      const entries =
        (body as ChangeRecordsResponse).entries ??
        (body as { records?: ChangeRecordEntry[] }).records ??
        [];
      return { entries };
    } catch {
      return { entries: [] };
    }
  },
  // Channels
  listChannelConfigs: () => get<ChannelConfigsResponse>(API_ROUTES.channels.listConfigs),
  putChannelConfig: (provider: string, body: unknown) =>
    // TODO: type when contract lands — putChannelConfig response
    post<unknown>(API_ROUTES.channels.putConfig(provider), body),
  createBinding: (body: unknown) =>
    // TODO: type when contract lands — createBinding response
    post<unknown>(API_ROUTES.channels.createBinding, body),
  deleteBinding: (id: string) => del(API_ROUTES.channels.deleteBinding(id)),
  // Artifacts
  getArtifact: (id: string) => get<ArtifactGetResponse>(API_ROUTES.artifacts.get(id)),
  resealArtifact: (id: string) =>
    // TODO: type when contract lands — reseal response
    post<unknown>(API_ROUTES.artifacts.reseal(id)),
  // Teams actions
  cancelTeam: (taskId: string, teamId: string) =>
    // TODO: type when contract lands
    post<unknown>(API_ROUTES.teams.cancel(taskId, teamId)),
  approveTeammate: (taskId: string, teamId: string, teammateId: string) =>
    // TODO: type when contract lands
    post<unknown>(API_ROUTES.teams.approveTeammate(taskId, teamId, teammateId)),
  rejectTeammate: (taskId: string, teamId: string, teammateId: string) =>
    // TODO: type when contract lands
    post<unknown>(API_ROUTES.teams.rejectTeammate(taskId, teamId, teammateId)),
  teammateEvents: (taskId: string, teamId: string, teammateId: string) =>
    // TODO: type when contract lands — events response
    get<unknown>(API_ROUTES.teams.teammateEvents(taskId, teamId, teammateId)),
  teamEvents: (taskId: string, teamId: string) =>
    // TODO: type when contract lands
    get<unknown>(API_ROUTES.teams.events(taskId, teamId)),
  recoveryLog: (taskId: string, teamId: string) =>
    // TODO: type when contract lands
    get<unknown>(API_ROUTES.teams.recoveryLog(taskId, teamId)),
  // Policies
  createPolicy: (body: unknown) =>
    // TODO: type when contract lands
    post<unknown>(API_ROUTES.criticalNodePolicies.create, body),
  updatePolicy: (id: string, body: unknown) =>
    // TODO: type when contract lands
    post<unknown>(API_ROUTES.criticalNodePolicies.update(id), body),
  deletePolicy: (id: string) => del(API_ROUTES.criticalNodePolicies.delete(id)),
};
