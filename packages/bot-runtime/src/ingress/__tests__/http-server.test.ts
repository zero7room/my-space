import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type IngressServer, createIngressServer } from "../http-server.js";

let server: IngressServer | null = null;

beforeEach(() => {
  server = null;
});
afterEach(async () => {
  if (server) await server.close();
});

describe("createIngressServer", () => {
  it("routes POST /webhooks/:provider to the registered handler", async () => {
    server = createIngressServer();
    server.route("POST", "/webhooks/feishu", async (req) => {
      return { status: 200, body: { ok: true, ct: req.headers["content-type"] ?? null } };
    });
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/webhooks/feishu`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, ct: "application/json" });
  });

  it("returns 404 for unknown route", async () => {
    server = createIngressServer();
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/nope`);
    expect(res.status).toBe(404);
  });

  it("returns 500 when handler throws", async () => {
    server = createIngressServer();
    server.route("POST", "/boom", async () => {
      throw new Error("kaboom");
    });
    const { port } = await server.listen(0);
    const res = await fetch(`http://127.0.0.1:${port}/boom`, { method: "POST" });
    expect(res.status).toBe(500);
  });

  it("passes raw body Buffer to the handler", async () => {
    server = createIngressServer();
    let seenLen = 0;
    server.route("POST", "/raw", async (req) => {
      seenLen = req.rawBody.length;
      return { status: 200, body: { len: seenLen } };
    });
    const { port } = await server.listen(0);
    await fetch(`http://127.0.0.1:${port}/raw`, { method: "POST", body: "abcdef" });
    expect(seenLen).toBe(6);
  });

  it("matches parameterized routes and exposes params to handler", async () => {
    server = createIngressServer();
    let captured: Record<string, string> | null = null;
    server.route("GET", "/api/threads/:id/tasks", async (req) => {
      captured = req.params;
      return { status: 200, body: { id: req.params.id } };
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/th_x/tasks`);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };
    expect(body.id).toBe("th_x");
    expect(captured).toEqual({ id: "th_x" });
  });

  it("prefers exact match over parameterized when both registered", async () => {
    server = createIngressServer();
    server.route("GET", "/api/threads/:id", async () => ({ status: 200, body: "param" }));
    server.route("GET", "/api/threads/list", async () => ({ status: 200, body: "exact" }));
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/threads/list`);
    const body = await r.text();
    expect(body).toContain("exact");
  });
});
