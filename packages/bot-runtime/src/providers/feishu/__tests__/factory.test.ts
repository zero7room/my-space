import { describe, expect, it } from "vitest";
import { createFeishuProviderFromConfig } from "../factory.js";

describe("createFeishuProviderFromConfig", () => {
  it("composes config + secrets + token cache into a Provider", async () => {
    const provider = createFeishuProviderFromConfig({
      config: {
        appId: "cli_x",
        verificationToken: "v_t",
        encryptKey: "",
        webhookEnabled: true,
        longConnectionEnabled: false,
        appSecretRef: "ref::FEISHU_APP_SECRET",
      },
      secrets: { appSecret: "s" },
      botOpenId: "ou_bot",
      fetchToken: async () => ({ token: "t1", expiresInSec: 7200 }),
    });
    expect(provider.provider).toBe("feishu");
    const r = await provider.verifyInbound({
      headers: {},
      rawBody: Buffer.from(
        JSON.stringify({ token: "v_t", type: "url_verification", challenge: "c" }),
      ),
      secret: "",
    });
    expect(r.ok).toBe(true);
  });
});
