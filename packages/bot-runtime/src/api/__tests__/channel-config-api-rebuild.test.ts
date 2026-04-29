// packages/bot-runtime/src/api/__tests__/channel-config-api-rebuild.test.ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createChannelConfigStore } from "../../channel/config-store.js";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountChannelConfigApi } from "../channel-config-api.js";

let tmp: string;
let server: IngressServer;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "cca2-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("Channel Config API onConfigChanged", () => {
  it("calls onConfigChanged after a successful PUT", async () => {
    const onChange = vi.fn();
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "a",
      onConfigChanged: onChange,
    });
    const { port } = await server.listen(0);
    await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({
        enabled: true,
        ingress: {},
        publicFields: { appId: "x", verificationToken: "y" },
        secretRefs: { appSecret: "ref::A" },
      }),
    });
    expect(onChange).toHaveBeenCalledWith("feishu");
  });

  it("does NOT call onConfigChanged when validation fails", async () => {
    const onChange = vi.fn();
    mountChannelConfigApi(server, {
      store: createChannelConfigStore(createPaths(tmp), runtimeId),
      adminToken: "a",
      onConfigChanged: onChange,
    });
    const { port } = await server.listen(0);
    await fetch(`http://127.0.0.1:${port}/api/channels/feishu`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": "a" },
      body: JSON.stringify({ enabled: "no" }),
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
