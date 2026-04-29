import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createPlanRepo } from "../../repositories/plan-repo.js";
import { createTaskRepo } from "../../repositories/task-repo.js";
import { createPaths } from "../../storage/paths.js";
import { buildDraft } from "../draft-builder.js";

describe("buildDraft", () => {
  let dataRoot: string;
  beforeEach(async () => {
    dataRoot = await mkdtemp(path.join(tmpdir(), "drf-"));
  });
  afterEach(async () => {
    await rm(dataRoot, { recursive: true, force: true });
  });

  it("creates a draft Task and a draft Plan from canned LLM JSON", async () => {
    const paths = createPaths(dataRoot);
    const taskRepo = createTaskRepo(paths, "rt-1");
    const planRepo = createPlanRepo(paths, "rt-1");
    const llm = createStubLlmClient(
      {},
      {
        kind: "json",
        data: {
          title: "ship landing page",
          description: "design + build the marketing landing page",
          objective: "deliver a 1-page marketing site",
          steps: [
            { id: "s1", title: "wireframe", status: "pending" },
            { id: "s2", title: "implement", status: "pending" },
          ],
          expectedArtifacts: ["index.html"],
        },
      },
    );

    const out = await buildDraft({
      llm,
      taskRepo,
      planRepo,
      threadId: "th_018f5d20-0000-7000-8000-000000000001",
      ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
      sourceMessageIds: ["msg-1"],
      userMessage: "build me a landing page",
    });

    expect(out.task.status).toBe("draft");
    expect(out.plan.status).toBe("draft");
    expect(out.plan.steps).toHaveLength(2);
  });
});
