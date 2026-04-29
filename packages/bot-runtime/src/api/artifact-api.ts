import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { IngressServer } from "../ingress/http-server.js";
import type { Paths } from "../storage/paths.js";

export type ArtifactApiOptions = {
  paths: Paths;
  runtimeId: string;
  adminToken: string;
};

function checkAdmin(h: Record<string, string | string[] | undefined>, e: string) {
  const v = h["x-admin-token"];
  return (Array.isArray(v) ? v[0] : v) === e;
}

function outputsDir(paths: Paths, runtimeId: string, threadId: string, taskId: string) {
  return path.posix.join(
    paths.state(runtimeId),
    "threads",
    threadId,
    "tasks",
    taskId,
    "user-data",
    "outputs",
  );
}

export function mountArtifactApi(server: IngressServer, opts: ArtifactApiOptions): void {
  server.route("GET", "/api/tasks/:id/artifacts", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const taskId = req.params.id ?? "";
    const url = new URL(req.url, "http://x");
    const threadId = url.searchParams.get("threadId") ?? "";
    const dir = outputsDir(opts.paths, opts.runtimeId, threadId, taskId);
    let files: string[] = [];
    try {
      files = await readdir(dir);
    } catch {
      return { status: 200, body: [] };
    }
    const out: Array<{ name: string; sizeBytes: number; modifiedAt: string }> = [];
    for (const f of files) {
      if (f.startsWith("_")) continue;
      const stats = await stat(path.posix.join(dir, f));
      if (stats.isFile()) {
        out.push({
          name: f,
          sizeBytes: stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      }
    }
    return { status: 200, body: out };
  });

  server.route("GET", "/api/tasks/:id/artifacts/:filename", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const taskId = req.params.id ?? "";
    const filename = req.params.filename ?? "";
    if (filename.includes("..") || filename.includes("/")) {
      return { status: 400, body: { error: "invalid filename" } };
    }
    const url = new URL(req.url, "http://x");
    const threadId = url.searchParams.get("threadId") ?? "";
    const dir = outputsDir(opts.paths, opts.runtimeId, threadId, taskId);
    try {
      const buf = await readFile(path.posix.join(dir, filename), "utf8");
      return {
        status: 200,
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: buf,
      };
    } catch {
      return { status: 404, body: { error: "not found" } };
    }
  });
}
