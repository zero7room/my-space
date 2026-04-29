// packages/bot-runtime/src/api/thread-event-broadcaster.ts
import { EventEmitter } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Paths } from "../storage/paths.js";

export type ThreadEvent = {
  id: string;
  kind: string;
  at: string;
  taskId?: string;
  [k: string]: unknown;
};

export type ThreadEventSubscription = {
  iterate(args: {
    replayFromCursor: string | null;
    abortSignal: AbortController;
  }): AsyncIterable<ThreadEvent>;
  abort: AbortController;
};

export type ThreadEventBroadcaster = {
  subscribe(threadId: string): ThreadEventSubscription;
  broadcast(threadId: string, event: ThreadEvent): void;
};

export function createThreadEventBroadcaster(deps: {
  paths: Paths;
  runtimeId: string;
}): ThreadEventBroadcaster {
  const ee = new EventEmitter();
  ee.setMaxListeners(100);

  async function readBacklog(threadId: string, fromCursor: string | null): Promise<ThreadEvent[]> {
    const tasksDir = path.posix.join(
      deps.paths.state(deps.runtimeId),
      "threads",
      threadId,
      "tasks",
    );
    let taskDirs: string[] = [];
    try {
      taskDirs = await readdir(tasksDir);
    } catch {
      return [];
    }
    const all: ThreadEvent[] = [];
    for (const td of taskDirs) {
      const eventsFile = path.posix.join(tasksDir, td, "events.jsonl");
      try {
        const content = await readFile(eventsFile, "utf8");
        for (const line of content.split("\n")) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ThreadEvent;
          if (fromCursor === null || e.id > fromCursor) all.push(e);
        }
      } catch {
        /* skip */
      }
    }
    all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
    return all;
  }

  return {
    subscribe(threadId) {
      const abort = new AbortController();
      const subject: ThreadEventSubscription = {
        abort,
        iterate({ replayFromCursor, abortSignal }) {
          const buf: ThreadEvent[] = [];
          let resolveNext: ((v: ThreadEvent | null) => void) | null = null;
          const onEvent = (e: ThreadEvent) => {
            if (resolveNext) {
              const r = resolveNext;
              resolveNext = null;
              r(e);
            } else {
              buf.push(e);
            }
          };
          ee.on(`thread:${threadId}`, onEvent);
          abortSignal.signal.addEventListener("abort", () => {
            ee.off(`thread:${threadId}`, onEvent);
            if (resolveNext) {
              const r = resolveNext;
              resolveNext = null;
              r(null);
            }
          });
          return (async function* () {
            const backlog = await readBacklog(threadId, replayFromCursor);
            for (const e of backlog) yield e;
            while (!abortSignal.signal.aborted) {
              const next = await new Promise<ThreadEvent | null>((res) => {
                if (buf.length > 0) {
                  const head = buf.shift();
                  if (head !== undefined) {
                    res(head);
                    return;
                  }
                }
                resolveNext = res;
              });
              if (next === null) return;
              yield next;
            }
          })();
        },
      };
      return subject;
    },
    broadcast(threadId, event) {
      ee.emit(`thread:${threadId}`, event);
    },
  };
}
