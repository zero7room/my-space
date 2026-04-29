import { describe, expect, it } from "vitest";
import { UserSchema } from "../user.js";

describe("UserSchema", () => {
  it("accepts a minimal user", () => {
    const u = {
      id: "u_018f5d20-0000-7000-8000-000000000001",
      displayName: "Alice",
      channelIdentities: {},
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    };
    expect(UserSchema.parse(u)).toEqual(u);
  });

  it("accepts feishu / slack / email identities", () => {
    const u = UserSchema.parse({
      id: "u_018f5d20-0000-7000-8000-000000000002",
      displayName: "Bob",
      channelIdentities: {
        feishu: { openId: "ou_xxx", tenantKey: "tk1" },
        slack: { userId: "U1", teamId: "T1" },
        email: "bob@x.com",
      },
      createdAt: "2026-04-28T00:00:00Z",
      updatedAt: "2026-04-28T00:00:00Z",
    });
    expect(u.channelIdentities.feishu?.openId).toBe("ou_xxx");
  });

  it("rejects malformed id", () => {
    expect(() =>
      UserSchema.parse({
        id: "not-prefixed",
        displayName: "X",
        channelIdentities: {},
        createdAt: "2026-04-28T00:00:00Z",
        updatedAt: "2026-04-28T00:00:00Z",
      }),
    ).toThrow();
  });
});
