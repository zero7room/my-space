import { describe, expect, it } from "vitest";
import { sanitize } from "../sanitize.js";

describe("sanitize", () => {
  it("redacts feishu app secret pattern", () => {
    const out = sanitize("App secret: D7yz9aMnop1234567890qrSTUVwxYZab");
    expect(out).toContain("<redacted:secret>");
    expect(out).not.toContain("D7yz9aMnop1234567890qrSTUVwxYZab");
  });

  it("redacts bearer tokens", () => {
    const out = sanitize("Authorization: Bearer abcDEF.ghi-JKL_mn0pqrstuvwxyz");
    expect(out).toContain("<redacted:secret>");
  });

  it("redacts emails", () => {
    const out = sanitize("contact alice@example.com today");
    expect(out).toBe("contact <redacted:pii> today");
  });

  it("redacts phone numbers", () => {
    expect(sanitize("call +86 138 1234 5678")).toContain("<redacted:pii>");
    expect(sanitize("tel: 13812345678")).toContain("<redacted:pii>");
  });

  it("recurses into objects and arrays", () => {
    const input = {
      user: { email: "bob@test.com", phone: "13800000000" },
      tokens: ["Bearer abcDEFghiJKLmnOPqrSTUVwxYZ12"],
      safe: 42,
    };
    const out = sanitize(input) as typeof input;
    expect(out.user.email).toContain("<redacted:pii>");
    expect(out.user.phone).toContain("<redacted:pii>");
    expect(out.tokens[0]).toContain("<redacted:secret>");
    expect(out.safe).toBe(42);
  });

  it("leaves non-string scalars untouched", () => {
    expect(sanitize(123)).toBe(123);
    expect(sanitize(true)).toBe(true);
    expect(sanitize(null)).toBe(null);
  });
});
