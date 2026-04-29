import { describe, expect, it } from "vitest";
import { createAnthropicLlmClient } from "../anthropic.js";

describe("createAnthropicLlmClient", () => {
  it("returns a client object with complete fn", () => {
    const client = createAnthropicLlmClient({
      apiKey: "sk-test",
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
    });
    expect(typeof client.complete).toBe("function");
  });

  it("complete returns text from anthropic sdk (mocked via injected sdk)", async () => {
    let capturedRequest: unknown = null;
    const fakeSdk = {
      messages: {
        create: async (req: unknown) => {
          capturedRequest = req;
          return {
            content: [{ type: "text", text: "hello" }],
          };
        },
      },
    };
    const client = createAnthropicLlmClient({
      apiKey: "sk-test",
      model: "claude-haiku-4-5-20251001",
      maxTokens: 1024,
      sdk: fakeSdk as never,
    });
    const resp = await client.complete({
      system: "you are helpful",
      messages: [{ role: "user", content: "hi" }],
      tools: [],
    });
    expect(resp).toEqual({ kind: "text", text: "hello" });
    expect(capturedRequest).toMatchObject({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
    });
  });
});
