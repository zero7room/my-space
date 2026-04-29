import type { IngressServer } from "../ingress/http-server.js";
import type { PlanRepo } from "../repositories/plan-repo.js";

export type PlanApiOptions = {
  planRepo: PlanRepo;
  adminToken: string;
};

function checkAdmin(h: Record<string, string | string[] | undefined>, e: string) {
  const v = h["x-admin-token"];
  return (Array.isArray(v) ? v[0] : v) === e;
}

export function mountPlanApi(server: IngressServer, opts: PlanApiOptions): void {
  server.route("GET", "/api/tasks/:id/plan", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const taskId = req.params.id ?? "";
    const plan = await opts.planRepo.loadByTaskId(taskId);
    if (!plan) return { status: 404, body: { error: "not found" } };
    return { status: 200, body: plan };
  });
}
