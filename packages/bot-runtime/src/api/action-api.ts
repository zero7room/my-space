import type { IngressServer } from "../ingress/http-server.js";
import type { IngestFn } from "../ingress/webhook-handler.js";

export type ActionApiOptions = {
  ingest: IngestFn;
  adminToken: string;
};

function checkAdmin(h: Record<string, string | string[] | undefined>, e: string) {
  const v = h["x-admin-token"];
  return (Array.isArray(v) ? v[0] : v) === e;
}

export function mountActionApi(server: IngressServer, opts: ActionApiOptions): void {
  server.route("POST", "/api/threads/:id/messages", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const threadId = req.params.id ?? "";
    let body: { text?: string; fromUserId?: string };
    try {
      body = JSON.parse(req.rawBody.toString("utf8")) as { text?: string; fromUserId?: string };
    } catch {
      return { status: 400, body: { error: "invalid json" } };
    }
    if (!body.text || !body.fromUserId) {
      return { status: 400, body: { error: "text and fromUserId required" } };
    }
    const result = await opts.ingest({
      threadId,
      messageId: `cm_${Date.now()}`,
      fromUserId: body.fromUserId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: null,
      messageText: body.text,
      at: new Date().toISOString(),
    });
    return { status: 200, body: { kind: result.kind } };
  });

  server.route("POST", "/api/tasks/:id/confirm", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    let body: { threadId?: string; fromUserId?: string };
    try {
      body = JSON.parse(req.rawBody.toString("utf8")) as { threadId?: string; fromUserId?: string };
    } catch {
      return { status: 400, body: { error: "invalid json" } };
    }
    if (!body.threadId || !body.fromUserId) {
      return { status: 400, body: { error: "threadId and fromUserId required" } };
    }
    const result = await opts.ingest({
      threadId: body.threadId,
      messageId: `cm_${Date.now()}`,
      fromUserId: body.fromUserId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "confirm",
      messageText: "/confirm",
      at: new Date().toISOString(),
    });
    return { status: 200, body: { kind: result.kind } };
  });

  server.route("POST", "/api/tasks/:id/cancel", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    let body: { threadId?: string; fromUserId?: string };
    try {
      body = JSON.parse(req.rawBody.toString("utf8")) as { threadId?: string; fromUserId?: string };
    } catch {
      return { status: 400, body: { error: "invalid json" } };
    }
    if (!body.threadId || !body.fromUserId) {
      return { status: 400, body: { error: "threadId and fromUserId required" } };
    }
    const result = await opts.ingest({
      threadId: body.threadId,
      messageId: `cm_${Date.now()}`,
      fromUserId: body.fromUserId,
      source: "client",
      bound: false,
      mentionsBot: true,
      replyToBotMessage: false,
      slashCommand: "cancel",
      messageText: "/cancel",
      at: new Date().toISOString(),
    });
    return { status: 200, body: { kind: result.kind } };
  });
}
