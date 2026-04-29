import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IngressServer } from "../../ingress/http-server.js";
import { createIngressServer } from "../../ingress/http-server.js";
import { createTranscriptRepo } from "../../repositories/transcript-repo.js";
import { newId } from "../../storage/ids.js";
import { createPaths } from "../../storage/paths.js";
import { mountTranscriptApi } from "../transcript-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "tr-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Transcript API", () => {
  it("GET /api/threads/:id/transcript returns appended transcript entries", async () => {
    const paths = createPaths(tmp);
    const transcript = createTranscriptRepo(paths, runtimeId);
    const threadId = newId("th");

    await transcript.append(threadId, {
      kind: "user_message",
      messageId: newId("msg"),
      text: "hello",
      at: "2026-04-29T01:00:00Z",
    });
    await transcript.append(threadId, {
      kind: "assistant_message",
      messageId: newId("msg"),
      text: "hi",
      at: "2026-04-29T01:01:00Z",
    });

    mountTranscriptApi(server, { transcript, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/transcript`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const lines = (await r.json()) as Array<{ kind: string; text: string }>;
    expect(lines).toHaveLength(2);
    expect(lines[0]?.kind).toBe("user_message");
    expect(lines[0]?.text).toBe("hello");
    expect(lines[1]?.kind).toBe("assistant_message");
    expect(lines[1]?.text).toBe("hi");
  });

  it("requires valid admin token", async () => {
    const paths = createPaths(tmp);
    const transcript = createTranscriptRepo(paths, runtimeId);
    const threadId = newId("th");

    mountTranscriptApi(server, { transcript, adminToken: "secret" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/transcript`, {
      headers: { "x-admin-token": "wrong" },
    });
    expect(r.status).toBe(401);
  });

  it("returns empty array for non-existent thread", async () => {
    const paths = createPaths(tmp);
    const transcript = createTranscriptRepo(paths, runtimeId);
    const threadId = newId("th");

    mountTranscriptApi(server, { transcript, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/${threadId}/transcript`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
    const lines = (await r.json()) as Array<unknown>;
    expect(lines).toHaveLength(0);
  });
});
