import { describe, expect, it } from "vitest";
import { createFeishuLongConnection } from "../long-connection.js";

describe("createFeishuLongConnection", () => {
  it("returns a noop adapter when disabled", async () => {
    const adapter = createFeishuLongConnection({ enabled: false });
    await expect(adapter.start(async () => ({ status: 200 }))).resolves.toBeUndefined();
    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it("throws not-implemented when enabled", async () => {
    const adapter = createFeishuLongConnection({ enabled: true });
    await expect(adapter.start(async () => ({ status: 200 }))).rejects.toThrow(
      /not implemented in v1/,
    );
  });
});
