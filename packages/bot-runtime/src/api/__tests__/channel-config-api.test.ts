import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChannelConfigStore } from "../../channel/config-store.js";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountChannelConfigApi } from "../channel-config-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "cca-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Channel Config API", () => {
  it("PUT /api/channels/:provider creates a config; GET returns sanitized view", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    mountChannelConfigApi(server, { store, adminToken: "admin" });
    const { port } = await server.listen(0);
    const put = await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "admin" },
      body: JSON.stringify({
        enabled: true,
        ingress: { webhookEnabled: true },
        publicFields: { appId: "cli_x", verificationToken: "v_t" },
        secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      }),
    });
    expect(put.status).toBe(200);

    const get = await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      headers: { "x-admin-token": "admin" },
    });
    const body = (await get.json()) as { secrets?: Record<string, { hasSecret: boolean }> };
    expect(body.secrets).toEqual({ appSecret: { hasSecret: true } });
  });

  it("GET /api/channels lists all sanitized configs", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", {
      enabled: true,
      ingress: {},
      publicFields: { appId: "x", verificationToken: "y" },
      secretRefs: { appSecret: "ref::A" },
    });
    mountChannelConfigApi(server, { store, adminToken: "admin" });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { "x-admin-token": "admin" },
    });
    const body = (await r.json()) as Array<{ provider: string }>;
    expect(body.map((c) => c.provider)).toEqual(["feishu"]);
  });

  it("returns 401 when admin token is wrong", async () => {
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "admin",
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { "x-admin-token": "wrong" },
    });
    expect(r.status).toBe(401);
  });

  it("PUT validates input schema", async () => {
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "admin",
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "admin" },
      body: JSON.stringify({ enabled: "not-a-bool" }),
    });
    expect(r.status).toBe(400);
  });
});
