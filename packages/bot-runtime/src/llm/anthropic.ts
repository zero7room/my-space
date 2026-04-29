import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";
import { decodeAnthropicResponseBlocks } from "./tool-use.js";

export type AnthropicLlmClientOptions = {
  apiKey: string;
  model: string;
  maxTokens: number;
  sdk?: Pick<Anthropic, "messages">;
};

export function createAnthropicLlmClient(
  opts: AnthropicLlmClientOptions,
): LlmClient {
  const sdk = opts.sdk ?? new Anthropic({ apiKey: opts.apiKey });
  return {
    async complete(req: LlmRequest): Promise<LlmResponse> {
      const result = await sdk.messages.create({
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: req.system,
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchemaJson,
        })),
        messages: req.messages.map((m) => ({
          role: m.role === "system" ? "assistant" : m.role,
          content: m.content,
        })),
      } as never);
      type AnyBlock = {
        type: string;
        text?: string;
        name?: string;
        input?: unknown;
        id?: string;
      };
      const blocks = (result as { content: AnyBlock[] }).content;
      return decodeAnthropicResponseBlocks(blocks);
    },
  };
}
