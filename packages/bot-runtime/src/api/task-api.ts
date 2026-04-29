import type { IngressServer } from "../ingress/http-server.js";
import type { TaskRepo } from "../repositories/task-repo.js";

export type TaskApiOptions = {
  taskRepo: TaskRepo;
  adminToken: string;
};

function checkAdmin(headers: Record<string, string | string[] | undefined>, expected: string) {
  const v = headers["x-admin-token"];
  return (Array.isArray(v) ? v[0] : v) === expected;
}

export function mountTaskApi(server: IngressServer, opts: TaskApiOptions): void {
  server.route("GET", "/api/threads/:id/tasks", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const threadId = req.params.id ?? "";
    const list = await opts.taskRepo.listByThread(threadId);
    return { status: 200, body: list };
  });
  server.route("GET", "/api/tasks/:id", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const id = req.params.id ?? "";
    const t = await opts.taskRepo.load(id);
    if (!t) return { status: 404, body: { error: "not found" } };
    return { status: 200, body: t };
  });
}
