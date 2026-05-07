/**
 * Acceptance 10.1 §1-9 end-to-end demo.
 *
 * Drives the runtime in-process (no HTTP) and exercises the full user-visible
 * flow from a chat message landing in a thread, through draft + confirmation,
 * executor run, mid-flight plan revision with artifact archive + ChangeRecord,
 * task completion + return to chatting, and finally runtime-restart
 * persistence by spinning up a fresh `RuntimePaths` against the same
 * `workspaceRoot`.
 *
 * Scope (verbatim, init/requirement.md L652-663):
 *   1. 用户在一个 thread 中连续对话。
 *   2. 系统识别用户提出的是新任务还是普通沟通。
 *   3. 系统生成草稿 task 和草稿 plan。
 *   4. 仅 owner user 确认后，task 进入 TaskList，状态变为 confirmed。
 *   5. runtime 开始执行 active task；同 thread 至多 1 个 running task。
 *   6. 客户端能看到任务状态、计划步骤、执行日志、产物与流式事件。
 *   7. 用户在执行中提出变更，系统能记录变更、归档旧 artifact、生成新
 *      PlanRevision、走确认门禁后继续执行；该变更必须留下一条
 *      ChangeRecord 关联旧 / 新 PlanRevision 与触发消息。
 *   8. task 完成后，系统回到沟通状态并等待下一个任务。
 *   9. runtime 重启后，thread / task / plan / transcript / artifact 不丢失。
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newArtifactId,
  newMessageId,
  newPlanId,
  newPlanRevisionId,
  newTaskId,
  newTaskListId,
  newThreadId,
  newUserId,
  type Plan,
  type Task,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../runtime/paths.js';
import { CriticalNodePolicyEngine } from '../critical-node/index.js';
import { createDefaultRegistry } from '../tools/index.js';
import { Executor, ScriptedAdapter } from '../executor/index.js';
import {
  HeuristicLlmGuard,
  MessageGuard,
  PlanRevisionService,
  TaskDraftService,
} from '../thread-loop/index.js';

const NOW = '2026-05-07T12:00:00.000Z';

function mkWorkspace(): string {
  return mkdtempSync(path.join(tmpdir(), 'acc-10-1-'));
}

function mkRt(workspaceRoot: string): RuntimePaths {
  return new RuntimePaths({ workspaceRoot, runtimeId: 'rt-acc' });
}

describe('Acceptance 10.1 §1-9 end-to-end demo', () => {
  it('conversation -> draft -> confirm -> execute -> change -> archive -> complete -> restart persistence', async () => {
    const workspaceRoot = mkWorkspace();
    let rt = mkRt(workspaceRoot);
    const owner = newUserId();
    const intruder = newUserId();
    const threadId = newThreadId();
    const taskListId = newTaskListId();

    // ------------------------------------------------------------------
    // §1: user opens a thread and starts a conversation.
    // ------------------------------------------------------------------
    await rt.users.upsert({
      id: owner,
      displayName: 'Ada',
      channelIdentities: {},
      createdAt: NOW,
      updatedAt: NOW,
    });
    await rt.threads.create({
      id: threadId,
      ownerUserId: owner,
      title: 'Analyse sales data',
      status: 'chatting',
      taskListId,
      channelBindingIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
    const msg1Id = newMessageId();
    await rt.threads.appendTranscript(threadId, {
      id: msg1Id,
      threadId,
      fromUserId: owner,
      source: 'client',
      text: '请帮我分析这份数据 and draft a report',
      at: NOW,
    });
    // Second message — exercises "连续对话" (continuous conversation).
    const chitChatId = newMessageId();
    await rt.threads.appendTranscript(threadId, {
      id: chitChatId,
      threadId,
      fromUserId: owner,
      source: 'client',
      text: 'also, lunch was nice today — just chatter',
      at: NOW,
    });
    const transcript1 = await rt.threads.readTranscript(threadId);
    expect(transcript1).toHaveLength(2);

    // ------------------------------------------------------------------
    // §2: MessageGuard classifies the first message as new_task, the
    //     second as chat — so the system distinguishes "new task" from
    //     "普通沟通".
    // ------------------------------------------------------------------
    const guard = new MessageGuard(new HeuristicLlmGuard(() => NOW), () => NOW);
    const newTaskDecision = await guard.classify({
      threadId,
      messageId: msg1Id,
      fromUserId: owner,
      source: 'client',
      text: '请帮我分析这份数据 and draft a report',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    expect(newTaskDecision.intent).toBe('new_task');
    expect(newTaskDecision.requiresUserConfirmation).toBe(true);

    const chatDecision = await guard.classify({
      threadId,
      messageId: chitChatId,
      fromUserId: owner,
      source: 'client',
      text: 'also, lunch was nice today — just chatter',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    expect(chatDecision.intent).toBe('chat');

    // Persist the guard decision — backs the "留下痕迹" requirement.
    await rt.threads.appendGuardDecision(newTaskDecision);
    const gd = await rt.threads.readGuardDecisions(threadId);
    expect(gd).toHaveLength(1);

    // ------------------------------------------------------------------
    // §3: system produces a draft Task + draft Plan.
    // ------------------------------------------------------------------
    const drafts = new TaskDraftService(rt);
    const draftTask = await drafts.createDraftTask({
      threadId,
      ownerUserId: owner,
      title: 'Analyse sales data',
      description: 'Produce an MD report from the attached CSV',
      sourceMessageIds: [msg1Id],
    });
    expect(draftTask.status).toBe('draft');
    const draftPlan = await drafts.createDraftPlan(threadId, draftTask.id, {
      taskId: draftTask.id,
      status: 'draft',
      objective: 'Produce MD report',
      steps: [
        { id: `step_${'a'.repeat(21)}`, title: 'load csv', status: 'pending' },
        { id: `step_${'b'.repeat(21)}`, title: 'render markdown', status: 'pending' },
      ],
      expectedArtifacts: ['outputs/report.md'],
      revisionIds: [],
    });
    expect(draftPlan.status).toBe('draft');
    // Thread now in waiting_confirmation with draftTaskId set.
    const thAfterDraft = await rt.threads.get(threadId);
    expect(thAfterDraft?.status).toBe('waiting_confirmation');
    expect(thAfterDraft?.draftTaskId).toBe(draftTask.id);

    // ------------------------------------------------------------------
    // §4: only the owner can confirm. Intruder is refused; owner
    //     promotes draft -> confirmed, task appears in TaskList.
    // ------------------------------------------------------------------
    await expect(
      drafts.confirmTask(threadId, draftTask.id, intruder),
    ).rejects.toThrow(/owner mismatch/);
    const confirmed = await drafts.confirmTask(threadId, draftTask.id, owner);
    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.confirmedByUserId).toBe(owner);
    const list = await rt.taskLists.load(threadId);
    expect(list?.orderedTaskIds).toContain(draftTask.id);

    // ------------------------------------------------------------------
    // §5: executor starts the confirmed task. Seed a queued state
    //     (confirmed -> queued is the scheduler's job; we emulate it
    //     here since the full scheduler is not in-process for this
    //     smoke), then the Executor runs it. Simultaneously ensure a
    //     second confirmed task does NOT enter running while the first
    //     is active — preserving "至多 1 个 running task".
    // ------------------------------------------------------------------
    // Promote confirmed -> queued.
    const queued: Task = {
      ...confirmed,
      status: 'queued',
      planId: draftPlan.id,
      activePlanRevisionId: undefined,
      updatedAt: NOW,
    };
    await rt.tasks.update(queued);

    // Activate the plan by writing it with status=active + an initial
    // PlanRevision that the revise flow later supersedes.
    const activePlan: Plan = {
      ...draftPlan,
      status: 'active',
      updatedAt: NOW,
    };
    await rt.plans.save(threadId, activePlan);
    const initialRevisionId = newPlanRevisionId();
    await rt.planRevisions.save(threadId, {
      id: initialRevisionId,
      planId: activePlan.id,
      taskId: queued.id,
      status: 'active',
      fullPlan: activePlan,
      reason: 'initial',
      sourceMessageId: msg1Id,
      archivedArtifactPaths: [],
      createdAt: NOW,
    });
    await rt.tasks.update({
      ...queued,
      activePlanRevisionId: initialRevisionId,
    });

    // Executor run — scripted to emit one tool_call + finish so we can
    // assert running transition + completion semantics.
    const tools = createDefaultRegistry();
    const policies = new CriticalNodePolicyEngine();
    const exec = new Executor({ rt, tools, policies, now: () => NOW });
    const adapter = new ScriptedAdapter([
      {
        toolName: 'write_file',
        toolArgs: {
          scope: 'outputs',
          path: 'report.md',
          contents: '# initial report\n',
        },
        rationale: 'produce initial MD report',
      },
      { kind: 'finish' },
    ]);
    // Run only 1 step so executor pauses BEFORE finish — lets us observe
    // the mid-flight change in §7 while the task has artifacts produced.
    await exec.runTask({
      threadId,
      taskId: queued.id,
      adapter,
      maxSteps: 1,
    });
    // After 1 step, task ran write_file but script cursor still points at
    // { kind: 'finish' }. The Executor's while loop keeps calling the
    // adapter until maxSteps runs out; with maxSteps=1 the loop bails
    // right after the first dispatchTool. The task is still running
    // (executor returned after 1 step without a finish proposal).
    const afterFirstRun = await rt.tasks.get(threadId, queued.id);
    expect(afterFirstRun?.status).toBe('running');

    // At-most-1 running-per-thread invariant — seed a second confirmed
    // task and prove nothing promotes it to running while task#1 is live.
    const task2 = await drafts.createDraftTask({
      threadId,
      ownerUserId: owner,
      title: 'Follow-up chart',
      description: 'Render a chart after the report',
      sourceMessageIds: [msg1Id],
    });
    await drafts.confirmTask(threadId, task2.id, owner);
    const tasksSoFar = await rt.tasks.listForThread(threadId);
    const runningCount = tasksSoFar.filter((t) => t.status === 'running').length;
    expect(runningCount).toBe(1);

    // ------------------------------------------------------------------
    // §6: client-observable surfaces. Event log contains task_started +
    //     tool_call events, and an artifact has landed on disk.
    // ------------------------------------------------------------------
    const events = await rt.tasks.readEventsSince(threadId, queued.id);
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('task_started');
    expect(kinds).toContain('tool_call_started');
    expect(kinds).toContain('tool_call_completed');

    // Executor's write_file tool records an artifact on disk; the
    // artifact record itself is emitted as part of the tool. For the
    // smoke we also seed a matching ArtifactRecord so the archive flow
    // in §7 has something to mark as archived (the write_file tool
    // persists to outputs/ but does NOT always write an ArtifactRecord
    // in v1 — this is intentional for the test, it lets §7 verify the
    // archive bookkeeping independently of tool-side artifact recording).
    const artId = newArtifactId();
    await rt.artifacts.save(threadId, {
      id: artId,
      taskId: queued.id,
      planRevisionId: initialRevisionId,
      relativePath: 'outputs/report.md',
      sizeBytes: 16,
      mimeType: 'text/markdown',
      sha256: 'a'.repeat(64),
      status: 'active',
      createdAt: NOW,
      updatedAt: NOW,
    });
    const artsBefore = await rt.artifacts.list(threadId, queued.id);
    expect(artsBefore).toHaveLength(1);
    expect(artsBefore[0]!.status).toBe('active');

    // ------------------------------------------------------------------
    // §7: user requests a change mid-execution. MessageGuard classifies
    //     as plan_update, PlanRevisionService executes the transaction:
    //     plan_revising -> new PlanRevision -> ChangeRecord ->
    //     archive artifacts -> (on failed: reset retry) -> plan_revised.
    //     Afterwards a ChangeRecord must exist linking old + new revision
    //     ids and the trigger message.
    // ------------------------------------------------------------------
    const changeMsgId = newMessageId();
    await rt.threads.appendTranscript(threadId, {
      id: changeMsgId,
      threadId,
      fromUserId: owner,
      source: 'client',
      text: 'please revise the plan to output CSV instead of MD',
      at: NOW,
    });
    const changeDecision = await guard.classify({
      threadId,
      messageId: changeMsgId,
      fromUserId: owner,
      source: 'client',
      text: 'please revise the plan to output CSV instead of MD',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    expect(changeDecision.intent).toBe('plan_update');
    expect(changeDecision.requiresUserConfirmation).toBe(true);

    const newPlanId_ = newPlanId();
    const newPlan: Plan = {
      id: newPlanId_,
      taskId: queued.id,
      status: 'active',
      objective: 'Produce CSV report (revised)',
      steps: [{ id: `step_${'c'.repeat(21)}`, title: 'emit csv', status: 'pending' }],
      expectedArtifacts: ['outputs/report.csv'],
      revisionIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    };
    await rt.plans.save(threadId, newPlan);

    const taskForRevise = await rt.tasks.get(threadId, queued.id);
    expect(taskForRevise).toBeTruthy();
    const revSvc = new PlanRevisionService(rt, undefined, () => NOW);
    const revResult = await revSvc.revise({
      threadId,
      task: taskForRevise!,
      oldPlanRevisionId: initialRevisionId,
      newPlan,
      reason: 'user request: CSV instead of MD',
      triggerMessageId: changeMsgId,
      triggerUserId: owner,
    });
    expect(revResult.revision.status).toBe('active');
    expect(revResult.revision.id).not.toBe(initialRevisionId);
    expect(revResult.task.activePlanRevisionId).toBe(revResult.revision.id);

    // Old artifact archived -> status flipped + relativePath moved
    // under outputs/_archive/<oldRevisionId>/.
    const artsAfter = await rt.artifacts.list(threadId, queued.id);
    expect(artsAfter).toHaveLength(1);
    expect(artsAfter[0]!.status).toBe('archived');
    expect(artsAfter[0]!.relativePath).toMatch(
      new RegExp(`^outputs/_archive/${initialRevisionId}/`),
    );

    // ChangeRecord links the old and new revisions and the trigger
    // message + triggering user.
    const changeRecords = await rt.changeRecords.list(threadId, queued.id);
    expect(changeRecords).toHaveLength(1);
    const cr = changeRecords[0]!;
    expect(cr.oldPlanRevisionId).toBe(initialRevisionId);
    expect(cr.newPlanRevisionId).toBe(revResult.revision.id);
    expect(cr.triggerMessageId).toBe(changeMsgId);
    expect(cr.triggerUserId).toBe(owner);
    expect(cr.archivedArtifactPaths).toHaveLength(1);

    // Events: both `plan_revising` and `plan_revised` landed in order.
    const eventsAfterRevise = await rt.tasks.readEventsSince(threadId, queued.id);
    const postReviseKinds = eventsAfterRevise.map((e) => e.kind);
    expect(postReviseKinds).toContain('plan_revising');
    expect(postReviseKinds).toContain('plan_revised');
    const revisingIdx = postReviseKinds.indexOf('plan_revising');
    const revisedIdx = postReviseKinds.indexOf('plan_revised');
    expect(revisingIdx).toBeLessThan(revisedIdx);

    // ------------------------------------------------------------------
    // §8: task completes and thread transitions back to chatting. The
    //     Executor's finish path writes `task_completed` +
    //     `thread_returned_to_chatting`. We re-run with a scripted
    //     finish and assert both.
    //
    //     NOTE: revise() leaves the task in its prior status; to reach
    //     completed we must first clear the `activeTaskId` bookkeeping
    //     on the thread (set by the draft -> confirm -> working cascade)
    //     and then finish the task.
    // ------------------------------------------------------------------
    const taskPreFinish = await rt.tasks.get(threadId, queued.id);
    // Thread was set to "working" in confirmTask — make sure activeTaskId
    // still points at task #1 so markThreadChattingIfDone flips on finish.
    const thPreFinish = await rt.threads.get(threadId);
    await rt.threads.update({
      ...thPreFinish!,
      activeTaskId: taskPreFinish!.id,
      updatedAt: NOW,
    });

    const finishAdapter = new ScriptedAdapter([{ kind: 'finish' }]);
    const finishOut = await exec.runTask({
      threadId,
      taskId: taskPreFinish!.id,
      adapter: finishAdapter,
      maxSteps: 1,
    });
    expect(finishOut.finalStatus).toBe('completed');
    const done = await rt.tasks.get(threadId, taskPreFinish!.id);
    expect(done?.status).toBe('completed');
    const threadAfterDone = await rt.threads.get(threadId);
    expect(threadAfterDone?.status).toBe('chatting');
    expect(threadAfterDone?.activeTaskId).toBeUndefined();
    const completionEvents = await rt.tasks.readEventsSince(
      threadId,
      taskPreFinish!.id,
    );
    const completionKinds = completionEvents.map((e) => e.kind);
    expect(completionKinds).toContain('task_completed');
    expect(completionKinds).toContain('thread_returned_to_chatting');

    // ------------------------------------------------------------------
    // §9: runtime restart persistence. Drop the rt handle, construct a
    //     fresh RuntimePaths against the same workspace root, and assert
    //     that thread, task, plan, transcript, artifact, change records
    //     all round-trip untouched.
    // ------------------------------------------------------------------
    // Simulate restart by abandoning rt and opening a new one.
    rt = mkRt(workspaceRoot);
    const threadRestored = await rt.threads.get(threadId);
    expect(threadRestored?.id).toBe(threadId);
    expect(threadRestored?.status).toBe('chatting');

    const taskRestored = await rt.tasks.get(threadId, queued.id);
    expect(taskRestored?.status).toBe('completed');
    expect(taskRestored?.activePlanRevisionId).toBe(revResult.revision.id);

    const planRestored = await rt.plans.get(threadId, queued.id);
    expect(planRestored?.id).toBe(newPlanId_);
    expect(planRestored?.objective).toMatch(/CSV/);

    const revisionsRestored = await rt.planRevisions.list(threadId, queued.id);
    expect(revisionsRestored.length).toBeGreaterThanOrEqual(2);
    expect(revisionsRestored.map((r) => r.id)).toContain(initialRevisionId);
    expect(revisionsRestored.map((r) => r.id)).toContain(revResult.revision.id);

    const transcriptRestored = await rt.threads.readTranscript(threadId);
    expect(transcriptRestored.length).toBeGreaterThanOrEqual(3);
    const texts = transcriptRestored.map((t) => t.text);
    expect(texts.some((t) => t.includes('请帮我分析'))).toBe(true);
    expect(texts.some((t) => t.includes('CSV'))).toBe(true);

    const artsRestored = await rt.artifacts.list(threadId, queued.id);
    expect(artsRestored).toHaveLength(1);
    expect(artsRestored[0]!.status).toBe('archived');

    const changeRecordsRestored = await rt.changeRecords.list(
      threadId,
      queued.id,
    );
    expect(changeRecordsRestored).toHaveLength(1);
    expect(changeRecordsRestored[0]!.triggerMessageId).toBe(changeMsgId);

    const taskListRestored = await rt.taskLists.load(threadId);
    expect(taskListRestored?.orderedTaskIds).toContain(queued.id);
    expect(taskListRestored?.orderedTaskIds).toContain(task2.id);
  }, 30_000);
});
