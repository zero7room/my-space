import { mkdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountArtifactApi } from "../artifact-api.js";

let tmp: string;
let server: IngressServer;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "art-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Artifact API", () => {
  it("GET /api/tasks/:id/artifacts lists files under outputs/", async () => {
    const paths = createPaths(tmp);
    const runtimeId = "rt_test";
    const threadId = "th_x";
    const taskId = "tk_y";
    const outputs = path.posix.join(
      paths.state(runtimeId),
      "threads",
      threadId,
      "tasks",
      taskId,
      "user-data",
      "outputs",
    );
    await mkdir(outputs, { recursive: true });
    await writeFile(path.posix.join(outputs, "a.txt"), "hello");

    mountArtifactApi(server, { paths, runtimeId, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(
      `http://127.0.0.1:${port}/api/tasks/${taskId}/artifacts?threadId=${threadId}`,
      {
        headers: { "x-admin-token": "a" },
      },
    );
    expect(r.status).toBe(200);
    const list = (await r.json()) as Array<{ name: string; sizeBytes: number }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe("a.txt");
    expect(list[0]?.sizeBytes).toBe(5);
  });

  it("GET /api/tasks/:id/artifacts/:filename returns file contents", async () => {
    const paths = createPaths(tmp);
    const runtimeId = "rt_test";
    const threadId = "th_x";
    const taskId = "tk_y";
    const outputs = path.posix.join(
      paths.state(runtimeId),
      "threads",
      threadId,
      "tasks",
      taskId,
      "user-data",
      "outputs",
    );
    await mkdir(outputs, { recursive: true });
    await writeFile(path.posix.join(outputs, "report.md"), "# title");
    mountArtifactApi(server, { paths, runtimeId, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(
      `http://127.0.0.1:${port}/api/tasks/${taskId}/artifacts/report.md?threadId=${threadId}`,
      { headers: { "x-admin-token": "a" } },
    );
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("# title");
  });
});
