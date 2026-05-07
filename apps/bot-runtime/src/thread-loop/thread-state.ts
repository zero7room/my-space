/**
 * Helpers used by ThreadLoop and Executor to keep thread state in sync with
 * task lifecycle.
 *
 * `markThreadChattingIfDone` flips a thread back to `chatting` (the v1 idle
 * post-task state) and clears `activeTaskId` once its active task reaches a
 * terminal outcome. Emits `thread_returned_to_chatting` so SSE clients can
 * re-enable the chat composer without polling.
 */
import { type Thread, type Task } from '@ai-workflow/contracts';

import type { RuntimePaths } from '../runtime/paths.js';
import type { SseRegistry } from '../runtime/sse/index.js';

const TERMINAL: ReadonlySet<Task['status']> = new Set([
  'completed',
  'cancelled',
]);

export async function markThreadChattingIfDone(
  rt: RuntimePaths,
  threadId: string,
  task: Task,
  sse?: SseRegistry,
  now: () => string = () => new Date().toISOString(),
): Promise<Thread | undefined> {
  if (!TERMINAL.has(task.status)) return undefined;
  const thread = await rt.threads.get(threadId);
  if (!thread) return undefined;
  if (thread.activeTaskId !== task.id) return thread;
  const ts = now();
  const next: Thread = {
    ...thread,
    activeTaskId: undefined,
    status: 'chatting',
    updatedAt: ts,
  };
  await rt.threads.update(next);
  const ev = await rt.tasks.appendEvent(threadId, task.id, {
    kind: 'thread_returned_to_chatting',
    taskId: task.id,
    threadId,
    payload: { fromTaskStatus: task.status },
    at: ts,
  });
  if (sse) sse.publish(ev);
  return next;
}
