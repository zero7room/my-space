import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createPaths } from "../../storage/paths.js";
import { createChannelConfigStore } from "../config-store.js";

let tmp: string;
const runtimeId = "rt_test";

beforeEach(async () => {
  tmp = await mkdtemp(path.join(tmpdir(), "ccs-"));
});

describe("ChannelConfigStore", () => {
  it("creates a config and returns sanitized view", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", {
      enabled: true,
      ingress: { webhookEnabled: true },
      publicFields: { appId: "cli_xxx" },
      secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
    });
    const view = await store.loadSanitized("feishu");
    expect(view?.enabled).toBe(true);
    expect(view?.publicFields).toEqual({ appId: "cli_xxx" });
    expect(view?.secrets).toEqual({ appSecret: { hasSecret: true } });
  });

  it("loadRaw exposes secretRefs (used by providers, not API)", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", {
      enabled: true,
      ingress: {},
      publicFields: {},
      secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
    });
    const raw = await store.loadRaw("feishu");
    expect(raw?.secretRefs.appSecret).toBe("ref::FEISHU_APP_SECRET");
  });

  it("returns null for missing provider", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    expect(await store.loadSanitized("slack")).toBeNull();
  });

  it("list returns all configured providers", async () => {
    const store = createChannelConfigStore(createPaths(tmp), runtimeId);
    await store.upsert("feishu", { enabled: true, ingress: {}, publicFields: {}, secretRefs: {} });
    await store.upsert("slack", { enabled: false, ingress: {}, publicFields: {}, secretRefs: {} });
    const all = await store.list();
    expect(all.map((c) => c.provider).sort()).toEqual(["feishu", "slack"]);
  });
});
