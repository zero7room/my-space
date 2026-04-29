import { describe, expect, it } from "vitest";
import { encodeSseEvent } from "../sse.js";

describe("encodeSseEvent", () => {
  it("encodes a custom event with id, event, and JSON data", () => {
    const got = encodeSseEvent({ id: "1", event: "custom", data: { foo: 1 } });
    expect(got).toBe(`id: 1\nevent: custom\ndata: {"foo":1}\n\n`);
  });

  it("supports plain comments / heartbeats", () => {
    expect(encodeSseEvent({ comment: "ping" })).toBe(": ping\n\n");
  });

  it("escapes newlines in data field", () => {
    const got = encodeSseEvent({ data: "line1\nline2" });
    expect(got).toContain("data: line1\ndata: line2\n");
  });
});
