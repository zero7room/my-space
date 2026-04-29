import { mkdir, readdir, rename, stat } from "node:fs/promises";
import path from "node:path";
import {
  type Plan,
  type PlanRevision,
  PlanRevisionSchema,
  PlanSchema,
  type PlanStep,
} from "../schema/plan.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type CreateDraftPlanInput = {
  taskId: string;
  threadId: string;
  objective: string;
  steps: PlanStep[];
  expectedArtifacts?: string[];
};

export type PlanRepo = {
  createDraftPlan(input: CreateDraftPlanInput): Promise<Plan>;
  loadPlan(threadId: string, taskId: string): Promise<Plan | null>;
  activate(planId: string, threadId: string, taskId: string): Promise<Plan>;
  supersedeWithRevision(
    planId: string,
    threadId: string,
    taskId: string,
    input: {
      reason: string;
      sourceMessageId: string;
      newPlan: { objective: string; steps: PlanStep[]; expectedArtifacts: string[] };
    },
  ): Promise<PlanRevision>;
  listRevisions(threadId: string, taskId: string): Promise<PlanRevision[]>;
};

async function moveDirContents(src: string, dst: string): Promise<void> {
  await mkdir(dst, { recursive: true });
  let entries: string[] = [];
  try {
    entries = await readdir(src);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === "_archive") continue;
    const srcPath = path.posix.join(src, name);
    const dstPath = path.posix.join(dst, name);
    const s = await stat(srcPath);
    if (s.isDirectory()) {
      await moveDirContents(srcPath, dstPath);
      continue;
    }
    await rename(srcPath, dstPath);
  }
}

export function createPlanRepo(paths: Paths, runtimeId: string): PlanRepo {
  return {
    async createDraftPlan(input) {
      const now = new Date().toISOString();
      const id = newId("pl");
      const plan = PlanSchema.parse({
        id,
        taskId: input.taskId,
        status: "draft",
        objective: input.objective,
        steps: input.steps,
        expectedArtifacts: input.expectedArtifacts ?? [],
        revisionIds: [],
        createdAt: now,
        updatedAt: now,
      });
      await mkdir(paths.taskDir(runtimeId, input.threadId, input.taskId), {
        recursive: true,
      });
      await writeJson(paths.taskPlan(runtimeId, input.threadId, input.taskId), plan);
      return plan;
    },

    async loadPlan(threadId, taskId) {
      const raw = await readJson(paths.taskPlan(runtimeId, threadId, taskId));
      return raw ? PlanSchema.parse(raw) : null;
    },

    async activate(planId, threadId, taskId) {
      const cur = await this.loadPlan(threadId, taskId);
      if (!cur) throw new Error(`plan not found for task ${taskId}`);
      if (cur.id !== planId) throw new Error("planId mismatch");
      const next = PlanSchema.parse({
        ...cur,
        status: "active",
        id: cur.id,
        createdAt: cur.createdAt,
        updatedAt: new Date().toISOString(),
      });
      await writeJson(paths.taskPlan(runtimeId, threadId, taskId), next);
      return next;
    },

    async supersedeWithRevision(planId, threadId, taskId, input) {
      const cur = await this.loadPlan(threadId, taskId);
      if (!cur) throw new Error(`plan not found for task ${taskId}`);
      if (cur.id !== planId) throw new Error("planId mismatch");

      const revisionId = newId("rv");
      const archiveDir = paths.outputsArchive(runtimeId, threadId, taskId, revisionId);
      const outputs = paths.outputs(runtimeId, threadId, taskId);
      const archivedPaths: string[] = [];
      try {
        const before = await readdir(outputs);
        for (const e of before) if (e !== "_archive") archivedPaths.push(e);
      } catch {
        /* outputs dir does not exist yet */
      }
      await moveDirContents(outputs, archiveDir);

      const supersededSnapshot = PlanSchema.parse({
        ...cur,
        status: "superseded",
        updatedAt: new Date().toISOString(),
      });
      await writeJson(
        paths.planRevision(runtimeId, threadId, taskId, `${revisionId}-prev`),
        PlanRevisionSchema.parse({
          id: `${revisionId}-prev`,
          planId,
          taskId,
          status: "superseded",
          fullPlan: supersededSnapshot,
          reason: input.reason,
          sourceMessageId: input.sourceMessageId,
          archivedArtifactPaths: archivedPaths,
          supersededAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
      );

      const now = new Date().toISOString();
      const newPlan = PlanSchema.parse({
        id: cur.id,
        taskId,
        status: "active",
        objective: input.newPlan.objective,
        steps: input.newPlan.steps,
        expectedArtifacts: input.newPlan.expectedArtifacts,
        revisionIds: [...cur.revisionIds, `${revisionId}-prev`, revisionId],
        createdAt: cur.createdAt,
        updatedAt: now,
      });
      await writeJson(paths.taskPlan(runtimeId, threadId, taskId), newPlan);

      const newRev = PlanRevisionSchema.parse({
        id: revisionId,
        planId,
        taskId,
        status: "active",
        fullPlan: newPlan,
        reason: input.reason,
        sourceMessageId: input.sourceMessageId,
        archivedArtifactPaths: [],
        createdAt: now,
      });
      await writeJson(paths.planRevision(runtimeId, threadId, taskId, revisionId), newRev);
      return newRev;
    },

    async listRevisions(threadId, taskId) {
      const dir = path.posix.join(paths.taskDir(runtimeId, threadId, taskId), "plan-revisions");
      let files: string[] = [];
      try {
        files = await readdir(dir);
      } catch {
        return [];
      }
      const out: PlanRevision[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const raw = await readJson(path.posix.join(dir, f));
        if (raw) out.push(PlanRevisionSchema.parse(raw));
      }
      return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    },
  };
}
