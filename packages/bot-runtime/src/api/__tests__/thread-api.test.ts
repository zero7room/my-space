import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountThreadApi } from "../thread-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ta-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Thread API", () => {
  it("GET /api/threads lists all threads with summary fields", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const t1 = await repo.create({ ownerUserId, title: "Project A" });
    const t2 = await repo.create({ ownerUserId, title: "Project B" });

    mountThreadApi(server, { threadRepo: repo, adminToken: "a", paths, runtimeId });
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/api/threads`, {
      headers: { "x-admin-token": "a" },
    });
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; title: string }>;
    const ids = list.map((t) => t.id).sort();
    expect(ids).toContain(t1.id);
    expect(ids).toContain(t2.id);
  });

  it("GET /api/threads/:id returns thread detail or 404", async () => {
    const paths = createPaths(tmp);
    const repo = createThreadRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const t = await repo.create({ ownerUserId, title: "Single" });
    mountThreadApi(server, { threadRepo: repo, adminToken: "a" });
    const { port } = await server.listen(0);
    const ok = await fetch(`http://127.0.0.1:${port}/api/threads/${t.id}`, {
      headers: { "x-admin-token": "a" },
    });
    expect(ok.status).toBe(200);
    const detail = (await ok.json()) as { id: string; title: string };
    expect(detail.title).toBe("Single");

    const miss = await fetch(`http://127.0.0.1:${port}/api/threads/th_missing`, {
      headers: { "x-admin-token": "a" },
    });
    expect(miss.status).toBe(404);
  });

  it("GET /api/threads returns 401 without admin token", async () => {
    mountThreadApi(server, {
      threadRepo: createThreadRepo(createPaths(tmp), runtimeId),
      adminToken: "a",
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads`);
    expect(r.status).toBe(401);
  });
});
