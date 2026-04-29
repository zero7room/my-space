import { describe, expect, it } from "vitest";
import { createAnthropicLlmClient } from "../anthropic.js";

describe("anthropic adapter — tool_use response", () => {
  it("translates anthropic tool_use block to LlmResponse tool_call", async () => {
    const fakeSdk = {
      messages: {
        create: async () => ({
          content: [
            {
              type: "tool_use",
              name: "write_file",
              input: { path: "a.txt", content: "x" },
              id: "toolu_1",
            },
          ],
        }),
      },
    };
    const client = createAnthropicLlmClient({
      apiKey: "k",
      model: "m",
      maxTokens: 1024,
      sdk: fakeSdk as never,
    });
    const out = await client.complete({
      system: "x",
      messages: [{ role: "user", content: "y" }],
      tools: [{ name: "write_file", description: "x", inputSchemaJson: {} }],
    });
    expect(out).toEqual({
      kind: "tool_call",
      toolName: "write_file",
      input: { path: "a.txt", content: "x" },
      id: "toolu_1",
    });
  });
});
