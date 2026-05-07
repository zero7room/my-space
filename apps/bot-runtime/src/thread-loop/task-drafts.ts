/**
 * Draft task / draft plan helpers used by ThreadLoop when MessageGuard returns
 * `new_task` or `plan_update` and no confirmed task exists yet.
 *
 * Drafts are always per-thread, persisted in `drafts/` until owner confirms.
 * Only a confirmed task ever lands in `TaskList`.
 */
import {
  type Task,
  type Plan,
  newPlanId,
  newTaskId,
} from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';

export interface CreateDraftTaskInput {
  threadId: string;
  ownerUserId: string;
  title: string;
  description: string;
  sourceMessageIds: string[];
}

export class TaskDraftService {
  constructor(private readonly rt: RuntimePaths) {}

  async createDraftTask(input: CreateDraftTaskInput): Promise<Task> {
    const id = newTaskId();
    const now = new Date().toISOString();
    const draft: Task = {
      id,
      threadId: input.threadId,
      ownerUserId: input.ownerUserId,
      title: input.title,
      description: input.description,
      status: 'draft',
      sourceMessageIds: input.sourceMessageIds,
      artifactIds: [],
      changeRecordIds: [],
      archivedRevisionIds: [],
      schemaVersion: 2,
      retry: { attemptCount: 0, maxRetries: 2 },
      createdAt: now,
      updatedAt: now,
    };
    await this.rt.tasks.create(draft);
    await this.rt.threads.writeDraftTask(input.threadId, draft);
    const t = await this.rt.threads.get(input.threadId);
    if (t) {
      await this.rt.threads.update({
        ...t,
        draftTaskId: id,
        status: 'waiting_confirmation',
        updatedAt: now,
      });
    }
    return draft;
  }

  async createDraftPlan(threadId: string, taskId: string, plan: Omit<Plan, 'id' | 'createdAt' | 'updatedAt'>): Promise<Plan> {
    const id = newPlanId();
    const now = new Date().toISOString();
    const next: Plan = {
      ...plan,
      id,
      taskId,
      createdAt: now,
      updatedAt: now,
    };
    await this.rt.plans.save(threadId, next);
    await this.rt.threads.writeDraftPlan(threadId, next);
    return next;
  }

  /**
   * Promote draft task → confirmed → queued. Appends to the TaskList.
   */
  async confirmTask(threadId: string, taskId: string, ownerUserId: string): Promise<Task> {
    const t = await this.rt.tasks.get(threadId, taskId);
    if (!t) throw new Error(`task ${taskId} not found`);
    if (t.ownerUserId !== ownerUserId) throw new Error('owner mismatch');
    if (t.status !== 'draft') throw new Error('task not draft');
    const now = new Date().toISOString();
    const next: Task = {
      ...t,
      status: 'confirmed',
      confirmedByUserId: ownerUserId,
      updatedAt: now,
    };
    await this.rt.tasks.update(next);

    // Append to TaskList.
    const list = (await this.rt.taskLists.load(threadId)) ?? {
      id: `tl_${'0'.repeat(21)}`,
      threadId,
      orderedTaskIds: [],
      createdAt: now,
      updatedAt: now,
    };
    if (!list.orderedTaskIds.includes(next.id)) {
      list.orderedTaskIds = [...list.orderedTaskIds, next.id];
    }
    list.updatedAt = now;
    await this.rt.taskLists.save(list);

    // Clear draft pointer on thread.
    const thread = await this.rt.threads.get(threadId);
    if (thread && thread.draftTaskId === taskId) {
      await this.rt.threads.update({
        ...thread,
        draftTaskId: undefined,
        activeTaskId: thread.activeTaskId ?? next.id,
        status: 'working',
        updatedAt: now,
      });
    }
    return next;
  }
}
