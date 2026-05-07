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
import { createDefaultRegistry } from '../index.js';

function mkctx() {
  const ws = mkdtempSync(path.join(tmpdir(), 'bash-tool-'));
  const rt = new RuntimePaths({ workspaceRoot: ws, runtimeId: 'rt-bash' });
  const threadId = newThreadId();
  const taskId = newTaskId();
  const task: Task = {
    id: taskId,
    threadId,
    ownerUserId: newUserId(),
    title: '',
    description: '',
    status: 'running',
    sourceMessageIds: [],
    artifactIds: [],
    changeRecordIds: [],
    archivedRevisionIds: [],
    schemaVersion: 2,
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
  };
  // Seed a task-list so InstancePaths returns sane dirs.
  void newTaskListId;
  return { rt, task, threadId, taskId };
}

describe('bash tool', () => {
  it('runs a command in the task workspace and captures stdout', async () => {
    const { rt, task, threadId } = mkctx();
    const reg = createDefaultRegistry();
    const out = (await reg.invoke<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>('bash', { rt, task, threadId }, { command: 'printf', args: ['hi'] }))!;
    expect(out.stdout).toBe('hi');
    expect(out.exitCode).toBe(0);
  });

  it('rejects command strings with shell metacharacters', async () => {
    const { rt, task, threadId } = mkctx();
    const reg = createDefaultRegistry();
    await expect(
      reg.invoke('bash', { rt, task, threadId }, {
        command: 'rm -rf /',
        args: [],
      }),
    ).rejects.toThrow(/invalid input/);
  });

  it('honors the timeout cap', async () => {
    const { rt, task, threadId } = mkctx();
    const reg = createDefaultRegistry();
    const out = (await reg.invoke<{
      stdout: string;
      stderr: string;
      exitCode: number;
    }>('bash', { rt, task, threadId }, {
      command: 'sleep',
      args: ['10'],
      timeoutMs: 200,
    }))!;
    expect(out.exitCode).not.toBe(0);
  }, 10_000);
});
