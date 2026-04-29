import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountPlanApi } from "../plan-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "pa-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Plan API", () => {
  it("GET /api/tasks/:id/plan returns the plan or 404", async () => {
    const paths = createPaths(tmp);
    const planRepo = createPlanRepo(paths, runtimeId);
    const taskId = newId("tk");
    const threadId = newId("th");
    const created = await planRepo.createDraftPlan({
      taskId,
      threadId,
      objective: "ship",
      steps: [{ id: "step_1", title: "step 1", status: "pending" }],
      expectedArtifacts: [],
    });
    mountPlanApi(server, { planRepo, adminToken: "a" });
    const { port } = await server.listen(0);

    const ok = await fetch(`http://127.0.0.1:${port}/api/tasks/${taskId}/plan`, {
      headers: { "x-admin-token": "a" },
    });
    expect(ok.status).toBe(200);
    const detail = (await ok.json()) as { id: string; objective: string };
    expect(detail.id).toBe(created.id);
    expect(detail.objective).toBe("ship");

    const miss = await fetch(`http://127.0.0.1:${port}/api/tasks/tk_missing/plan`, {
      headers: { "x-admin-token": "a" },
    });
    expect(miss.status).toBe(404);
  });
});
