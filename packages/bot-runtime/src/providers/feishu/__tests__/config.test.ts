import { describe, expect, it } from "vitest";
import { type FeishuConfig, parseFeishuConfig, resolveFeishuSecrets } from "../config.js";

describe("FeishuConfig", () => {
  it("parses publicFields + secretRefs into a typed config", () => {
    const cfg: FeishuConfig = parseFeishuConfig({
      provider: "feishu",
      enabled: true,
      ingress: { webhookEnabled: true, longConnectionEnabled: false },
      publicFields: { appId: "cli_x", verificationToken: "v_t", encryptKey: "" },
      secretRefs: { appSecret: "ref::FEISHU_APP_SECRET" },
      createdAt: "2026-04-29T01:00:00Z",
      updatedAt: "2026-04-29T01:00:00Z",
    });
    expect(cfg.appId).toBe("cli_x");
    expect(cfg.verificationToken).toBe("v_t");
    expect(cfg.encryptKey).toBe("");
    expect(cfg.appSecretRef).toBe("ref::FEISHU_APP_SECRET");
  });

  it("rejects when appId or verificationToken is missing", () => {
    expect(() =>
      parseFeishuConfig({
        provider: "feishu",
        enabled: true,
        ingress: {},
        publicFields: {},
        secretRefs: {},
        createdAt: "2026-04-29T01:00:00Z",
        updatedAt: "2026-04-29T01:00:00Z",
      }),
    ).toThrow(/appId/);
  });

  it("resolveFeishuSecrets pulls appSecret from env by ref name", async () => {
    const env = { FEISHU_APP_SECRET: "real-secret" };
    const secrets = await resolveFeishuSecrets(
      { appSecretRef: "ref::FEISHU_APP_SECRET" } as FeishuConfig,
      env,
    );
    expect(secrets.appSecret).toBe("real-secret");
  });

  it("resolveFeishuSecrets throws on missing env entry", async () => {
    await expect(
      resolveFeishuSecrets({ appSecretRef: "ref::MISSING" } as FeishuConfig, {}),
    ).rejects.toThrow(/MISSING/);
  });
});
