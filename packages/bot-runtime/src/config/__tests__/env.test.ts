import { describe, expect, it } from "vitest";
import { parseRuntimeConfig } from "../env.js";

describe("parseRuntimeConfig", () => {
  it("requires DATA_DIR and BOT_RUNTIME_ROLE", () => {
    expect(() => parseRuntimeConfig({})).toThrow(/DATA_DIR/);
    expect(() => parseRuntimeConfig({ DATA_DIR: "/x" })).toThrow(/BOT_RUNTIME_ROLE/);
  });

  it("accepts hybrid + defaults", () => {
    const cfg = parseRuntimeConfig({
      DATA_DIR: "/x",
      BOT_RUNTIME_ROLE: "hybrid",
      RUNTIME_ID: "rt-test",
    });
    expect(cfg.role).toBe("hybrid");
    expect(cfg.runtimeId).toBe("rt-test");
    expect(cfg.dedupeRetentionDays).toBe(30);
  });

  it("rejects unknown role", () => {
    expect(() =>
      parseRuntimeConfig({
        DATA_DIR: "/x",
        BOT_RUNTIME_ROLE: "weird",
        RUNTIME_ID: "rt-1",
      }),
    ).toThrow(/role/);
  });
});
