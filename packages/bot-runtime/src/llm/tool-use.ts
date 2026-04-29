import type { LlmResponse } from "./client.js";

type AnyBlock = {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
};

export function decodeAnthropicResponseBlocks(blocks: AnyBlock[]): LlmResponse {
  for (const b of blocks) {
    if (b.type === "tool_use" && b.name && b.id) {
      return {
        kind: "tool_call",
        toolName: b.name,
        input: (b.input as Record<string, unknown>) ?? {},
        id: b.id,
      };
    }
  }
  for (const b of blocks) {
    if (b.type === "text" && typeof b.text === "string") {
      return { kind: "text", text: b.text };
    }
  }
  throw new Error("anthropic response had no recognizable block");
}
