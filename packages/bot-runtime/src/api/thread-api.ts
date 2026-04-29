import type { IngressServer } from "../ingress/http-server.js";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { Paths } from "../storage/paths.js";

export type ThreadApiOptions = {
  threadRepo: ThreadRepo;
  adminToken: string;
  paths?: Paths;
  runtimeId?: string;
};

function checkAdmin(headers: Record<string, string | string[] | undefined>, expected: string) {
  const got = headers["x-admin-token"];
  const value = Array.isArray(got) ? got[0] : got;
  return value === expected;
}

export function mountThreadApi(server: IngressServer, opts: ThreadApiOptions): void {
  server.route("GET", "/api/threads", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const threads = await opts.threadRepo.listAll();
    return { status: 200, body: threads };
  });

  server.route("GET", "/api/threads/:id", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const id = req.params.id ?? "";
    const t = await opts.threadRepo.load(id);
    if (!t) return { status: 404, body: { error: "not found" } };
    return { status: 200, body: t };
  });
}
