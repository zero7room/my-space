import { describe, expect, it } from "vitest";
import { type LlmRequest, createStubLlmClient } from "../client.js";

describe("createStubLlmClient", () => {
  it("returns canned reply per prompt", async () => {
    const client = createStubLlmClient({
      "what?": { kind: "text", text: "ok" },
    });
    const req: LlmRequest = {
      system: "x",
      messages: [{ role: "user", content: "what?" }],
      tools: [],
    };
    const resp = await client.complete(req);
    expect(resp).toEqual({ kind: "text", text: "ok" });
  });

  it("falls back to default reply when prompt missing", async () => {
    const client = createStubLlmClient({}, { kind: "text", text: "default" });
    const resp = await client.complete({
      system: "x",
      messages: [{ role: "user", content: "anything" }],
      tools: [],
    });
    expect(resp).toEqual({ kind: "text", text: "default" });
  });

  it("throws when no canned reply and no default", async () => {
    const client = createStubLlmClient({});
    await expect(
      client.complete({
        system: "x",
        messages: [{ role: "user", content: "anything" }],
        tools: [],
      }),
    ).rejects.toThrow();
  });
});
