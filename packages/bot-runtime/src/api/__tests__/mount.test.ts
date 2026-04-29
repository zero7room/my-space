import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createChannelConfigStore } from "../../channel/config-store.js";
import { type IngressServer, createIngressServer } from "../../ingress/http-server.js";
import { createPaths } from "../../storage/paths.js";
import { mountAdminApi } from "../mount.js";

let tmp: string;
let server: IngressServer;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "mn-"));
  server = createIngressServer();
});

afterEach(async () => {
  await server.close();
});

describe("mountAdminApi", () => {
  it("registers GET /api/channels", async () => {
    mountAdminApi(server, {
      adminToken: "a",
      channelStore: createChannelConfigStore(createPaths(tmp), "rt_test"),
    });
    const { port } = await server.listen(0);
    const r = await fetch(`http://127.0.0.1:${port}/api/channels`, {
      headers: { "x-admin-token": "a" },
    });
    expect(r.status).toBe(200);
  });
});
