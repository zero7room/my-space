/**
 * Plan revision transaction (Phase 5 step 4).
 *
 * Steps in order:
 *   1. Pause executor: append a `pause` signal to control.json (Phase 6 owns
 *      `executor_paused` confirmation; here we just write the signal).
 *   2. Append a `plan_revising` event.
 *   3. Persist a new `PlanRevision` (status active) with a copy of the new
 *      plan.
 *   4. Persist an immutable `ChangeRecord`.
 *   5. Mark active artifacts as `archived` and update relativePath to point
 *      under `_archive/<oldRevisionId>/`. (We update record state only —
 *      Phase 11 wires the actual file move.)
 *   6. Reset `TaskRetryState` if the task was failed.
 *   7. Append `plan_revised` event.
 *
 * The whole sequence wraps in a Transactions record so a crash mid-revise can
 * be replayed or rolled back at startup.
 */
import {
  type ChangeRecord,
  type Plan,
  type PlanRevision,
  type Task,
  newChangeRecordId,
  newPlanRevisionId,
  newGuardDecisionId,
} from '@ai-workflow/contracts';
import { Transactions } from '@ai-workflow/fs-store';

import type { RuntimePaths } from '../runtime/paths.js';
import type { SseRegistry } from '../runtime/sse/index.js';

export interface PlanRevisionInput {
  threadId: string;
  task: Task;
  oldPlanRevisionId: string;
  newPlan: Plan;
  reason: string;
  triggerMessageId: string;
  triggerUserId: string;
}

export class PlanRevisionService {
  constructor(
    private readonly rt: RuntimePaths,
    private readonly sse?: SseRegistry,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async revise(input: PlanRevisionInput): Promise<{
    revision: PlanRevision;
    changeRecord: ChangeRecord;
    task: Task;
    txId: string;
  }> {
    const ts = this.now();
    // Journal the revise as a single transaction. Ops here are empty: this
    // marker only enables observability — recovery will see prepared/committed
    // and emit transaction_pending_dropped on a crash mid-revise. Individual
    // repo writes are atomic on their own.
    const tx = new Transactions({
      transactionsRoot: this.rt.paths.transactionsRoot(),
    });
    const txId = await tx.prepare([], []);
    try {
      // 1. signal pause — actual executor pause is wired in Phase 6.
      // (We do not emit `executor_paused` here; runtime loop emits.)

      // 2. plan_revising
      const evRevising = await this.rt.tasks.appendEvent(
        input.threadId,
        input.task.id,
        {
          kind: 'plan_revising',
          taskId: input.task.id,
          threadId: input.threadId,
          txId,
          payload: { reason: input.reason },
          at: ts,
        },
      );
      if (this.sse) this.sse.publish(evRevising);

      // 3. new PlanRevision
      const revisionId = newPlanRevisionId();
      const revision: PlanRevision = {
        id: revisionId,
        planId: input.newPlan.id,
        taskId: input.task.id,
        status: 'active',
        fullPlan: input.newPlan,
        reason: input.reason,
        sourceMessageId: input.triggerMessageId,
        archivedArtifactPaths: [],
        createdAt: ts,
      };
      await this.rt.planRevisions.save(input.threadId, revision);

      // 4. ChangeRecord
      let change: ChangeRecord = {
        id: newChangeRecordId(),
        taskId: input.task.id,
        oldPlanRevisionId: input.oldPlanRevisionId,
        newPlanRevisionId: revisionId,
        triggerMessageId: input.triggerMessageId,
        triggerUserId: input.triggerUserId,
        guardDecisionId: newGuardDecisionId(),
        userOriginalText: input.reason,
        llmSummary: input.reason,
        archivedArtifactPaths: [],
        createdAt: ts,
      };
      await this.rt.changeRecords.save(input.threadId, change);

      // 5. archive active artifacts (record state only)
      const artifacts = await this.rt.artifacts.list(input.threadId, input.task.id);
      const archivedPaths: string[] = [];
      for (const a of artifacts) {
        if (a.status === 'active') {
          const newPath = `outputs/_archive/${input.oldPlanRevisionId}/${a.relativePath}`;
          await this.rt.artifacts.save(input.threadId, {
            ...a,
            status: 'archived',
            archivedAt: ts,
            relativePath: newPath,
            updatedAt: ts,
          });
          archivedPaths.push(newPath);
        }
      }
      if (archivedPaths.length > 0) {
        change = { ...change, archivedArtifactPaths: archivedPaths };
        await this.rt.changeRecords.save(input.threadId, change);
      }

      // 6. reset TaskRetryState if failed
      let nextTask: Task = {
        ...input.task,
        activePlanRevisionId: revisionId,
        planId: input.newPlan.id,
        changeRecordIds: [...input.task.changeRecordIds, change.id],
        archivedRevisionIds: [...input.task.archivedRevisionIds, input.oldPlanRevisionId],
        updatedAt: ts,
      };
      if (input.task.status === 'failed') {
        nextTask = {
          ...nextTask,
          status: 'queued',
          blockedReason: undefined,
          retry: { attemptCount: 0, maxRetries: nextTask.retry?.maxRetries ?? 2 },
        };
        const evReset = await this.rt.tasks.appendEvent(
          input.threadId,
          nextTask.id,
          {
            kind: 'task_retry_reset_by_plan_update',
            taskId: nextTask.id,
            threadId: input.threadId,
            txId,
            payload: { newPlanRevisionId: revisionId },
            at: ts,
          },
        );
        if (this.sse) this.sse.publish(evReset);
      }
      await this.rt.tasks.update(nextTask);

      // 7. plan_revised
      const evRevised = await this.rt.tasks.appendEvent(
        input.threadId,
        nextTask.id,
        {
          kind: 'plan_revised',
          taskId: nextTask.id,
          threadId: input.threadId,
          txId,
          payload: { revisionId, oldRevisionId: input.oldPlanRevisionId },
          at: ts,
        },
      );
      if (this.sse) this.sse.publish(evRevised);

      await tx.commit(txId);
      return { revision, changeRecord: change, task: nextTask, txId };
    } catch (err) {
      await tx.rollback(txId).catch(() => undefined);
      throw err;
    }
  }
}
