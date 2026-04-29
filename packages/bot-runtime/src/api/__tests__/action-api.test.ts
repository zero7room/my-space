import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { mountActionApi } from "../action-api.js";

let server: IngressServer;

beforeEach(async () => {
  server = createIngressServer();
});
afterEach(async () => {
  await server.close();
});

describe("Action API", () => {
  it("POST /api/threads/:id/messages calls ingest with client source", async () => {
    const ingest = vi.fn().mockResolvedValue({ kind: "noop", intent: "chat" });
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ text: "hi", fromUserId: "u_alice" }),
    });
    expect(r.status).toBe(200);
    expect(ingest).toHaveBeenCalledTimes(1);
    const arg = ingest.mock.calls[0]![0];
    expect(arg.source).toBe("client");
    expect(arg.threadId).toBe("th_x");
    expect(arg.messageText).toBe("hi");
    expect(arg.fromUserId).toBe("u_alice");
  });

  it("POST /api/tasks/:id/confirm injects a confirm slash via ingest", async () => {
    const ingest = vi.fn().mockResolvedValue({ kind: "dispatched", intent: "confirm_task" });
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/tk_x/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ threadId: "th_x", fromUserId: "u_alice" }),
    });
    expect(r.status).toBe(200);
    const call = ingest.mock.calls[0]![0];
    expect(call.slashCommand).toBe("confirm");
  });

  it("POST /api/tasks/:id/cancel injects a cancel slash via ingest", async () => {
    const ingest = vi.fn().mockResolvedValue({ kind: "dispatched", intent: "cancel_task" });
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/tasks/tk_x/cancel`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ threadId: "th_x", fromUserId: "u_alice" }),
    });
    expect(r.status).toBe(200);
    const call = ingest.mock.calls[0]![0];
    expect(call.slashCommand).toBe("cancel");
  });

  it("returns 401 without admin token", async () => {
    const ingest = vi.fn();
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/messages`, {
      method: "POST",
      body: "{}",
    });
    expect(r.status).toBe(401);
  });

  it("returns 400 when text or fromUserId missing", async () => {
    const ingest = vi.fn();
    mountActionApi(server, { ingest, adminToken: "a" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ text: "hi" }),
    });
    expect(r.status).toBe(400);
  });
});
