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
  tmp = await mkdtemp(path.join(tmpdir(), "fwi-"));
});

afterEach(async () => {
  if (host) await host.close();
  host = null;
  vi.unstubAllGlobals();
});

async function findGuardDecisionsTotal(stateRoot: string): Promise<number> {
  const fs = await import("node:fs/promises");
  const threadsDir = `${stateRoot}/threads`;
  const threads = await fs.readdir(threadsDir).catch(() => []);
  let total = 0;
  for (const t of threads) {
    const file = `${threadsDir}/${t}/guard-decisions.jsonl`;
    try {
      const content = await fs.readFile(file, "utf8");
      const lines = content.split("\n").filter((l) => l.trim().length > 0);
      total += lines.length;
    } catch {
      /* skip */
    }
  }
  return total;
}

describe("feishu webhook idempotency (v1 acceptance #10)", () => {
  it("same event_id delivered twice yields exactly one GuardDecision", async () => {
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
        ingress: {},
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(cfgRes.status).toBe(200);

    const inbound = {
      token: "v_t",
      schema: "2.0",
      header: {
        event_id: "ev_dup",
        event_type: "im.message.receive_v1",
        create_time: "1714349900000",
      },
      event: {
        sender: { sender_id: { open_id: "ou_alice" } },
        message: {
          message_id: "om_dup",
          message_type: "text",
          chat_id: "p2p_alice",
          chat_type: "p2p",
          content: '{"text":"hi"}',
          mentions: [],
        },
      },
    };
    const url = `http://127.0.0.1:${host.ingressPort}/webhooks/feishu`;
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(inbound),
    } as const;

    const first = await fetch(url, init);
    expect(first.status).toBe(200);

    const second = await fetch(url, init);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { duplicate?: boolean };
    expect(secondBody.duplicate).toBe(true);

    const stateRoot = `${tmp}/instances/rt_test/state`;
    const totalDecisions = await findGuardDecisionsTotal(stateRoot);
    expect(totalDecisions).toBeLessThanOrEqual(1);
  });
});
