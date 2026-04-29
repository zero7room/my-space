import { z } from "zod";
import type { ChannelConfigStore } from "../channel/config-store.js";
import type { IngressServer } from "../ingress/http-server.js";

const UpsertSchema = z.object({
  enabled: z.boolean(),
  ingress: z.object({
    webhookEnabled: z.boolean().optional(),
    longConnectionEnabled: z.boolean().optional(),
  }),
  publicFields: z.record(z.union([z.string(), z.boolean(), z.number()])),
  secretRefs: z.record(z.string()),
});

export type ChannelConfigApiOptions = {
  store: ChannelConfigStore;
  adminToken: string;
  onConfigChanged?: (provider: string) => void | Promise<void>;
};

function checkAdmin(headers: Record<string, string | string[] | undefined>, expected: string) {
  const got = headers["x-admin-token"];
  const value = Array.isArray(got) ? got[0] : got;
  return value === expected;
}

export function mountChannelConfigApi(server: IngressServer, opts: ChannelConfigApiOptions): void {
  server.route("GET", "/api/channels", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const list = await opts.store.list();
    return { status: 200, body: list };
  });

  server.route("GET", "/api/channels/feishu", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    const got = await opts.store.loadSanitized("feishu");
    if (!got) return { status: 404, body: { error: "not configured" } };
    return { status: 200, body: got };
  });

  server.route("PUT", "/api/channels/feishu", async (req) => {
    if (!checkAdmin(req.headers, opts.adminToken)) return { status: 401 };
    let parsed: ReturnType<typeof UpsertSchema.parse>;
    try {
      parsed = UpsertSchema.parse(JSON.parse(req.rawBody.toString("utf8")));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { status: 400, body: { error: message } };
    }
    const cfg = await opts.store.upsert("feishu", parsed);
    await opts.onConfigChanged?.("feishu");
    return { status: 200, body: { provider: cfg.provider, updatedAt: cfg.updatedAt } };
  });
}
