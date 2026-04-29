// packages/bot-runtime/src/runtime/__tests__/hybrid-host-channel.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStubLlmClient } from "../../llm/client.js";
import { createPaths } from "../../storage/paths.js";
import { createHybridHost } from "../hybrid-host.js";

let tmp: string;
let host: Awaited<ReturnType<typeof createHybridHost>> | null = null;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "hh-"));
});

afterEach(async () => {
  if (host) await host.close();
  host = null;
});

describe("HybridHost — channel wiring", () => {
  it("exposes ingressPort, registry, and outboundRunner.tickOnce", async () => {
    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient({}, { kind: "text", text: "" }),
      draftLlm: createStubLlmClient({}, { kind: "text", text: "" }),
      execLlm: createStubLlmClient({}, { kind: "text", text: "" }),
      systemPrompt: "x",
      maxSteps: 8,
      leaseMs: 30000,
      channel: { adminToken: "admin", ingressPort: 0 },
    });
    expect(typeof host.ingressPort).toBe("number");
    expect(typeof host.outboundRunner.tickOnce).toBe("function");
    expect(host.providerRegistry.list()).toEqual([]);
  });

  it("admin PUT /api/channels/feishu registers a Feishu provider", async () => {
    host = await createHybridHost({
      paths: createPaths(tmp),
      runtimeId: "rt_test",
      guardLlm: createStubLlmClient({}, { kind: "text", text: "" }),
      draftLlm: createStubLlmClient({}, { kind: "text", text: "" }),
      execLlm: createStubLlmClient({}, { kind: "text", text: "" }),
      systemPrompt: "x",
      maxSteps: 8,
      leaseMs: 30000,
      channel: {
        adminToken: "admin",
        ingressPort: 0,
        env: { FEISHU_APP_SECRET: "test" },
        botOpenIdProvider: () => "ou_bot",
      },
    });
    const r = await fetch(`http://127.0.0.1:${host.ingressPort}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "admin" },
      body: JSON.stringify({
        enabled: true,
        ingress: { webhookEnabled: true },
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(r.status).toBe(200);
    expect(host.providerRegistry.list()).toEqual(["feishu"]);
  });
});
