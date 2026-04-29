// packages/bot-runtime/src/api/__tests__/thread-event-broadcaster.test.ts
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { createThreadEventBroadcaster } from "../thread-event-broadcaster.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "teb-"));
});

describe("ThreadEventBroadcaster", () => {
  it("yields existing events.jsonl entries for a thread, oldest first", async () => {
    const paths = createPaths(tmp);
    const threadId = newId("th");
    const taskId = newId("tk");
    const eventsDir = path.posix.join(paths.state(runtimeId), "threads", threadId, "tasks", taskId);
    await mkdir(eventsDir, { recursive: true });
    await writeFile(
      path.posix.join(eventsDir, "events.jsonl"),
      `${[
        JSON.stringify({
          id: "ev_1",
          kind: "executor_started",
          taskId,
          at: "2026-04-29T01:00:00Z",
        }),
        JSON.stringify({
          id: "ev_2",
          kind: "executor_finished",
          taskId,
          at: "2026-04-29T01:01:00Z",
        }),
      ].join("\n")}\n`,
    );
    const bc = createThreadEventBroadcaster({ paths, runtimeId });
    const events: string[] = [];
    const sub = bc.subscribe(threadId);
    for await (const e of sub.iterate({ replayFromCursor: null, abortSignal: sub.abort })) {
      events.push(e.id);
      if (events.length === 2) {
        sub.abort.abort();
        break;
      }
    }
    expect(events).toEqual(["ev_1", "ev_2"]);
  });

  it("forwards thread-level broadcast events to subscribers", async () => {
    const paths = createPaths(tmp);
    const threadId = newId("th");
    await mkdir(path.posix.join(paths.state(runtimeId), "threads", threadId), {
      recursive: true,
    });

    const bc = createThreadEventBroadcaster({ paths, runtimeId });
    const sub = bc.subscribe(threadId);
    const collected: string[] = [];
    const consumer = (async () => {
      for await (const e of sub.iterate({ replayFromCursor: null, abortSignal: sub.abort })) {
        collected.push(e.id);
        if (collected.length === 1) {
          sub.abort.abort();
          break;
        }
      }
    })();
    await new Promise((r) => setTimeout(r, 20));
    bc.broadcast(threadId, { id: "thr_ev_1", kind: "values", at: "x" });
    await consumer;
    expect(collected).toEqual(["thr_ev_1"]);
  });
});
