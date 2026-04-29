import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createThreadRepo } from "../../repositories/thread-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountTaskApi } from "../task-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "tk-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Task API", () => {
  it("GET /api/threads/:id/tasks lists tasks for thread", async () => {
    const paths = createPaths(tmp);
    const threadRepo = createThreadRepo(paths, runtimeId);
    const taskRepo = createTaskRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const thread = await threadRepo.create({ ownerUserId, title: "T" });
    const t1 = await taskRepo.createDraft({
      threadId: thread.id,
      ownerUserId,
      title: "Task 1",
      description: "d",
      sourceMessageIds: [],
    });

    mountTaskApi(server, { taskRepo, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/${thread.id}/tasks`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const list = (await r.json()) as Array<{ id: string }>;
    expect(list.map((t) => t.id)).toContain(t1.id);
  });

  it("GET /api/tasks/:id returns task detail", async () => {
    const paths = createPaths(tmp);
    const threadRepo = createThreadRepo(paths, runtimeId);
    const taskRepo = createTaskRepo(paths, runtimeId);
    const ownerUserId = newId("u");
    const thread = await threadRepo.create({ ownerUserId, title: "T" });
    const task = await taskRepo.createDraft({
      threadId: thread.id,
      ownerUserId,
      title: "Detail",
      description: "d",
      sourceMessageIds: [],
    });
    mountTaskApi(server, { taskRepo, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/${task.id}`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const detail = (await r.json()) as { title: string };
    expect(detail.title).toBe("Detail");
  });
});
