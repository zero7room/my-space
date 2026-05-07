/**
 * API route constants. Frontend, runtime, and tests must import from here —
 * never hard-code path strings.
 */

export const API_PREFIX = '/api';

export const API_ROUTES = {
  user: {
    me: `${API_PREFIX}/users/me`,
  },
  threads: {
    list: `${API_PREFIX}/threads`,
    create: `${API_PREFIX}/threads`,
    get: (id: string) => `${API_PREFIX}/threads/${id}`,
    postMessage: (id: string) => `${API_PREFIX}/threads/${id}/messages`,
    events: (id: string) => `${API_PREFIX}/threads/${id}/events`,
    ack: (id: string) => `${API_PREFIX}/threads/${id}/ack`,
  },
  tasks: {
    get: (id: string) => `${API_PREFIX}/tasks/${id}`,
    confirm: (id: string) => `${API_PREFIX}/tasks/${id}/confirm`,
    reject: (id: string) => `${API_PREFIX}/tasks/${id}/reject`,
    retry: (id: string) => `${API_PREFIX}/tasks/${id}/retry`,
    skip: (id: string) => `${API_PREFIX}/tasks/${id}/skip`,
    pause: (id: string) => `${API_PREFIX}/tasks/${id}/pause`,
    resume: (id: string) => `${API_PREFIX}/tasks/${id}/resume`,
    cancel: (id: string) => `${API_PREFIX}/tasks/${id}/cancel`,
    criticalNodeApprove: (id: string) =>
      `${API_PREFIX}/tasks/${id}/critical-node/approve`,
    criticalNodeReject: (id: string) =>
      `${API_PREFIX}/tasks/${id}/critical-node/reject`,
    retryHistory: (id: string) => `${API_PREFIX}/tasks/${id}/retry-history`,
    plans: (id: string) => `${API_PREFIX}/tasks/${id}/plans`,
    plan: (id: string, revisionId: string) =>
      `${API_PREFIX}/tasks/${id}/plans/${revisionId}`,
    confirmPlan: (id: string, revisionId: string) =>
      `${API_PREFIX}/tasks/${id}/plans/${revisionId}/confirm`,
    rejectPlan: (id: string, revisionId: string) =>
      `${API_PREFIX}/tasks/${id}/plans/${revisionId}/reject`,
  },
  artifacts: {
    get: (id: string) => `${API_PREFIX}/artifacts/${id}`,
    reseal: (id: string) => `${API_PREFIX}/artifacts/${id}/reseal`,
  },
  channels: {
    listConfigs: `${API_PREFIX}/channels/configs`,
    putConfig: (provider: string) =>
      `${API_PREFIX}/channels/configs/${provider}`,
    listBindings: `${API_PREFIX}/channels/bindings`,
    createBinding: `${API_PREFIX}/channels/bindings`,
    deleteBinding: (id: string) => `${API_PREFIX}/channels/bindings/${id}`,
    feishuWebhook: `${API_PREFIX}/channels/feishu/webhook`,
  },
  criticalNodePolicies: {
    list: `${API_PREFIX}/critical-node-policies`,
    create: `${API_PREFIX}/critical-node-policies`,
    update: (id: string) => `${API_PREFIX}/critical-node-policies/${id}`,
    delete: (id: string) => `${API_PREFIX}/critical-node-policies/${id}`,
  },
  skills: {
    loadStatus: `${API_PREFIX}/skills/load-status`,
  },
  runtime: {
    health: `${API_PREFIX}/runtime/health`,
    metrics: `${API_PREFIX}/runtime/metrics`,
  },
  teams: {
    listForTask: (taskId: string) => `${API_PREFIX}/tasks/${taskId}/teams`,
    get: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}`,
    workItems: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/work-items`,
    messages: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/messages`,
    teammates: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/teammates`,
    teammateEvents: (taskId: string, teamId: string, teammateId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/teammates/${teammateId}/events`,
    events: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/events`,
    recoveryLog: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/recovery-log`,
    cancel: (taskId: string, teamId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/cancel`,
    approveTeammate: (taskId: string, teamId: string, teammateId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/teammates/${teammateId}/approve`,
    rejectTeammate: (taskId: string, teamId: string, teammateId: string) =>
      `${API_PREFIX}/tasks/${taskId}/teams/${teamId}/teammates/${teammateId}/reject`,
  },
} as const;

/**
 * The owner-first action set. Every endpoint listed here MUST verify
 * `req.user.id === resource.ownerUserId` before mutating state.
 */
export const OWNER_FIRST_ACTIONS = [
  'tasks.confirm',
  'tasks.reject',
  'tasks.retry',
  'tasks.skip',
  'tasks.pause',
  'tasks.resume',
  'tasks.cancel',
  'tasks.criticalNodeApprove',
  'tasks.criticalNodeReject',
  'tasks.retryHistory',
  'tasks.confirmPlan',
  'tasks.rejectPlan',
  'channels.deleteBinding',
  'criticalNodePolicies.create',
  'criticalNodePolicies.update',
  'criticalNodePolicies.delete',
  'teams.cancel',
  'teams.approveTeammate',
  'teams.rejectTeammate',
] as const;
export type OwnerFirstAction = (typeof OWNER_FIRST_ACTIONS)[number];
