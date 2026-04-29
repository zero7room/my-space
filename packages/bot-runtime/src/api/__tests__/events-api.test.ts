import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountEventsApi } from "../events-api.js";
import { createThreadEventBroadcaster } from "../thread-event-broadcaster.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ev-"));
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Events API (SSE)", () => {
  it("GET /api/threads/:id/events streams existing backlog as SSE events", async () => {
    const paths = createPaths(tmp);
    const threadId = newId("th");
    const taskId = newId("tk");
    const tdir = path.posix.join(paths.state(runtimeId), "threads", threadId, "tasks", taskId);
    await mkdir(tdir, { recursive: true });
    await writeFile(
      path.posix.join(tdir, "events.jsonl"),
      `${JSON.stringify({ id: "ev_1", kind: "executor_started", at: "2026-04-29T01:00:00Z" })}\n`,
    );

    const bc = createThreadEventBroadcaster({ paths, runtimeId });
    mountEventsApi(server, { broadcaster: bc, adminToken: "a" });
    const { port } = await server.listen(0);

    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/events`, {
      headers: { "x-admin-token": "a" },
      signal: ctrl.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    if (!res.body) throw new Error("missing body");
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    const collected: string[] = [];
    while (collected.join("").indexOf("ev_1") < 0) {
      const { value, done } = await reader.read();
      if (done) break;
      collected.push(dec.decode(value));
    }
    expect(collected.join("")).toContain("id: ev_1");
    ctrl.abort();
  });

  it("returns 401 without admin token", async () => {
    const bc = createThreadEventBroadcaster({ paths: createPaths(tmp), runtimeId });
    mountEventsApi(server, { broadcaster: bc, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/events`);
    expect(r.status).toBe(401);
  });
});
