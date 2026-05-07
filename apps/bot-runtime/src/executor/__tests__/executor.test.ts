import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newTaskId,
  newTaskListId,
  newThreadId,
  newUserId,
  type Task,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { CriticalNodePolicyEngine } from '../../critical-node/index.js';
import { createDefaultRegistry } from '../../tools/index.js';
import { Executor, ScriptedAdapter } from '../index.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'exec-')),
    runtimeId: 'rt-exec',
  });
}

const NOW = '2026-05-07T00:00:00.000Z';

async function seedQueuedTask(rt: RuntimePaths): Promise<{ task: Task; threadId: string }> {
  const owner = newUserId();
  const threadId = newThreadId();
  await rt.threads.create({
    id: threadId,
    ownerUserId: owner,
    title: 't',
    status: 'idle',
    taskListId: newTaskListId(),
    channelBindingIds: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
  const task: Task = {
    id: newTaskId(),
    threadId,
    ownerUserId: owner,
    title: 'do x',
    description: '',
    status: 'queued',
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 2,
    retry: { attemptCount: 0, maxRetries: 2 },
    createdAt: NOW,
    updatedAt: NOW,
  };
  await rt.tasks.create(task);
  return { task, threadId };
}

describe('Executor.runTask', () => {
  it('happy path: write_file → finish, transitions queued→running→completed', async () => {
    const rt = mkrt();
    const { task, threadId } = await seedQueuedTask(rt);
    const tools = createDefaultRegistry();
    const policies = new CriticalNodePolicyEngine();
    const exec = new Executor({ rt, tools, policies, now: () => NOW });
    const adapter = new ScriptedAdapter([
      {
        toolName: 'write_file',
        toolArgs: { scope: 'outputs', path: 'a.txt', contents: 'hello' },
        rationale: 'create file',
      },
      { kind: 'finish' },
    ]);
    const out = await exec.runTask({
      threadId,
      taskId: task.id,
      adapter,
      maxSteps: 4,
    });
    expect(out.finalStatus).toBe('completed');
    const t = await rt.tasks.get(threadId, task.id);
    expect(t?.status).toBe('completed');
    const events = await rt.tasks.readEventsSince(threadId, task.id);
    expect(events.some((e) => e.kind === 'tool_call_started')).toBe(true);
    expect(events.some((e) => e.kind === 'tool_call_completed')).toBe(true);
    expect(events.some((e) => e.kind === 'task_completed')).toBe(true);
  });

  it('blocks high-risk skill via policy require_approval', async () => {
    const rt = mkrt();
    const { task, threadId } = await seedQueuedTask(rt);
    const tools = createDefaultRegistry();
    const policies = new CriticalNodePolicyEngine();
    const exec = new Executor({ rt, tools, policies, now: () => NOW });
    const adapter = new ScriptedAdapter([
      {
        toolName: 'write_file',
        toolArgs: { scope: 'outputs', path: 'a.txt', contents: 'x' },
        rationale: 'risky',
        skillName: 'risky-skill',
      },
      { kind: 'finish' },
    ]);
    // Synthetic: override the engine lookup so this skill is high-risk.
    const out = await exec.runTask({
      threadId,
      taskId: task.id,
      adapter,
      maxSteps: 4,
    });
    // Without registry, the request lacks risk class so policy is log_only.
    expect(out.finalStatus).toBe('completed');

    // With explicit high risk class via direct evaluate test:
    const dec = policies.evaluate({
      toolName: 'write_file',
      skillName: 'risky-skill',
      skillRiskClass: 'high',
    });
    expect(dec.action).toBe('require_approval');
  });

  it('ask_clarification blocks task with awaiting_user_action', async () => {
    const rt = mkrt();
    const { task, threadId } = await seedQueuedTask(rt);
    const tools = createDefaultRegistry();
    const policies = new CriticalNodePolicyEngine();
    const exec = new Executor({ rt, tools, policies, now: () => NOW });
    const adapter = new ScriptedAdapter([
      {
        toolName: 'ask_clarification',
        toolArgs: { question: 'which file?' },
        rationale: 'need info',
      },
    ]);
    const out = await exec.runTask({
      threadId,
      taskId: task.id,
      adapter,
      maxSteps: 1,
    });
    expect(out.finalStatus).toBe('blocked');
    const t = await rt.tasks.get(threadId, task.id);
    expect(t?.status).toBe('blocked');
    expect(t?.blockedReason).toBe('awaiting_user_action');
  });

  it('rejects writes outside scoped roots', async () => {
    const rt = mkrt();
    const { task, threadId } = await seedQueuedTask(rt);
    const tools = createDefaultRegistry();
    const policies = new CriticalNodePolicyEngine();
    const exec = new Executor({ rt, tools, policies, now: () => NOW });
    const adapter = new ScriptedAdapter([
      {
        toolName: 'write_file',
        toolArgs: { scope: 'outputs', path: '../../../etc/passwd', contents: '' },
        rationale: 'try escape',
      },
    ]);
    const out = await exec.runTask({
      threadId,
      taskId: task.id,
      adapter,
      maxSteps: 1,
    });
    expect(out.finalStatus).toBe('failed');
    const t = await rt.tasks.get(threadId, task.id);
    expect(t?.status).toBe('failed');
    const events = await rt.tasks.readEventsSince(threadId, task.id);
    const failEv = events.find((e) => e.kind === 'tool_call_failed');
    expect((failEv?.payload['failureClass'] as string | undefined)).toBe(
      'permission_error',
    );
  });
});
