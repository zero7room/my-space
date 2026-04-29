import { describe, expect, it } from "vitest";
import { isValidId, newId } from "../ids.js";

describe("ids", () => {
  it("newId returns prefixed UUIDv7", () => {
    const id = newId("th");
    expect(id).toMatch(/^th_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("ids are monotonically increasing in time", async () => {
    const a = newId("tk");
    await new Promise((r) => setTimeout(r, 2));
    const b = newId("tk");
    expect(a < b).toBe(true);
  });

  it("isValidId checks prefix and uuid form", () => {
    expect(isValidId(newId("th"), "th")).toBe(true);
    expect(isValidId("th_not-a-uuid", "th")).toBe(false);
    expect(isValidId(newId("th"), "tk")).toBe(false);
  });
});
