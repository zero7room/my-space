import type { IngressServer } from "../ingress/http-server.js";
import { encodeSseEvent } from "./sse.js";
import type { ThreadEventBroadcaster } from "./thread-event-broadcaster.js";

export type EventsApiOptions = {
  broadcaster: ThreadEventBroadcaster;
  adminToken: string;
};

function checkAdmin(
  headers: Record<string, string | string[] | undefined>,
  url: string,
  expected: string,
) {
  const v = headers["x-admin-token"];
  const headerVal = Array.isArray(v) ? v[0] : v;
  if (headerVal === expected) return true;
  try {
    return new URL(url, "http://x").searchParams.get("_token") === expected;
  } catch {
    return false;
  }
}

export function mountEventsApi(server: IngressServer, opts: EventsApiOptions): void {
  server.route("GET", "/api/threads/:id/events", async (req) => {
    if (!checkAdmin(req.headers, req.url, opts.adminToken)) return { status: 401 };
    const threadId = req.params.id ?? "";
    const url = new URL(req.url, "http://x");
    const cursor = url.searchParams.get("cursor");
    const sub = opts.broadcaster.subscribe(threadId);
    return {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
      stream: async (write, end, abort) => {
        write(encodeSseEvent({ comment: "subscribed" }));
        abort.addEventListener("abort", () => {
          sub.abort.abort();
        });
        try {
          for await (const e of sub.iterate({ replayFromCursor: cursor, abortSignal: sub.abort })) {
            write(encodeSseEvent({ id: e.id, event: e.kind, data: e }));
          }
        } finally {
          end();
        }
      },
    };
  });
}
