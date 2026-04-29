// packages/bot-runtime/tests/integration/feishu-webhook-wiring.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createStubLlmClient } from "../../src/llm/client.js";
import { createHybridHost } from "../../src/runtime/hybrid-host.js";
import { createPaths } from "../../src/storage/paths.js";

let tmp: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "fww-"));
});

afterEach(async () => {
  if (host) await host.close();
  host = null;
  vi.unstubAllGlobals();
});

describe("feishu webhook wiring (smoke test)", () => {
  it("inbound DM webhook flows through verify → normalize → ingest → guard", async () => {
    // Stub fetch: pass through localhost calls (admin API + webhook) to real fetch,
    // intercept external calls (tenant_access_token) with canned responses.
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        const urlStr = String(url);
        if (urlStr.includes("127.0.0.1") || urlStr.includes("localhost")) {
          return realFetch(url, init);
        }
        if (urlStr.includes("/tenant_access_token/")) {
          return {
            ok: true,
            json: async () => ({ code: 0, tenant_access_token: "tk", expire: 7200 }),
          };
        }
        return { ok: false, status: 404, text: async () => "no" };
      }),
    );

    const guardJson = JSON.stringify({
      intent: "chat",
      confidence: 0.5,
      reason: "stub",
    });

    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient({}, { kind: "text", text: guardJson }),
      draftLlm: createStubLlmClient({}, { kind: "text", text: "draft stub" }),
      execLlm: createStubLlmClient({}, { kind: "text", text: "exec stub" }),
      systemPrompt: "x",
      maxSteps: 4,
      leaseMs: 30000,
      channel: {
        adminToken: "a",
        ingressPort: 0,
        env: { FEISHU_APP_SECRET: "s" },
        botOpenIdProvider: () => "ou_bot",
      },
    });

    // configure feishu via admin API
    const cfgRes = await fetch(`http://127.0.0.1:${host.ingressPort}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({
        enabled: true,
        ingress: { webhookEnabled: true },
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(cfgRes.status).toBe(200);
    expect(host.providerRegistry.list()).toEqual(["feishu"]);

    // simulate inbound feishu DM webhook (chat_type=p2p)
    const inbound = {
      token: "v_t",
      schema: "2.0",
      header: {
        event_id: "ev_smoke",
        event_type: "im.message.receive_v1",
        create_time: "1714349900000",
      },
      event: {
        sender: { sender_id: { open_id: "ou_alice" } },
        message: {
          message_id: "om_smoke",
          message_type: "text",
          chat_id: "p2p_alice",
          chat_type: "p2p",
          content: '{"text":"hi"}',
          mentions: [],
        },
      },
    };
    const r = await fetch(`http://127.0.0.1:${host.ingressPort}/webhooks/feishu`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inbound),
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);

    // Guardian thread should now exist for u_alice — guardRepo should have a decision
    // We can't easily query without knowing threadId, so we count files via fs.
    const fs = await import("node:fs/promises");
    const stateRoot = `${tmp}/instances/rt_test/state`;
    const threadsDir = `${stateRoot}/threads`;
    const threadDirs = await fs.readdir(threadsDir).catch(() => []);
    expect(threadDirs.length).toBeGreaterThanOrEqual(1);
  });
});
