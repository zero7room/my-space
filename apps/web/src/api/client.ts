export type ApiClient = {
  getThreads(): Promise<Array<{ id: string; title: string; status: string }>>;
  getThread(id: string): Promise<{ id: string; title: string; status: string }>;
  getTasks(threadId: string): Promise<unknown[]>;
  getTask(taskId: string): Promise<unknown>;
  getPlan(taskId: string): Promise<unknown>;
  getArtifacts(
    taskId: string,
    threadId: string,
  ): Promise<Array<{ name: string; sizeBytes: number; modifiedAt: string }>>;
  getArtifact(taskId: string, threadId: string, name: string): Promise<string>;
  getTranscript(threadId: string): Promise<unknown[]>;
  postMessage(
    threadId: string,
    body: { text: string; fromUserId: string },
  ): Promise<{ kind: string }>;
  confirmTask(
    taskId: string,
    body: { threadId: string; fromUserId: string },
  ): Promise<{ kind: string }>;
  cancelTask(
    taskId: string,
    body: { threadId: string; fromUserId: string },
  ): Promise<{ kind: string }>;
  getChannels(): Promise<unknown[]>;
  putChannel(provider: string, body: unknown): Promise<unknown>;
};

export type CreateApiClientInput = {
  baseUrl: string;
  adminToken: string;
};

export function createApiClient(input: CreateApiClientInput): ApiClient {
  const headers = {
    "x-admin-token": input.adminToken,
    "content-type": "application/json",
  };

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    };
    const res = await fetch(`${input.baseUrl}${path}`, init);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`${res.status} ${text}`);
    }
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  return {
    getThreads: () => request("GET", "/api/threads"),
    getThread: (id) => request("GET", `/api/threads/${id}`),
    getTasks: (threadId) => request("GET", `/api/threads/${threadId}/tasks`),
    getTask: (taskId) => request("GET", `/api/tasks/${taskId}`),
    getPlan: (taskId) => request("GET", `/api/tasks/${taskId}/plan`),
    getArtifacts: (taskId, threadId) =>
      request("GET", `/api/tasks/${taskId}/artifacts?threadId=${encodeURIComponent(threadId)}`),
    getArtifact: (taskId, threadId, name) =>
      request(
        "GET",
        `/api/tasks/${taskId}/artifacts/${encodeURIComponent(name)}?threadId=${encodeURIComponent(threadId)}`,
      ),
    getTranscript: (threadId) => request("GET", `/api/threads/${threadId}/transcript`),
    postMessage: (threadId, body) => request("POST", `/api/threads/${threadId}/messages`, body),
    confirmTask: (taskId, body) => request("POST", `/api/tasks/${taskId}/confirm`, body),
    cancelTask: (taskId, body) => request("POST", `/api/tasks/${taskId}/cancel`, body),
    getChannels: () => request("GET", "/api/channels"),
    putChannel: (provider, body) => request("PUT", `/api/channels/${provider}`, body),
  };
}
