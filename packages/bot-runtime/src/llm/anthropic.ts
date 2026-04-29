import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, LlmRequest, LlmResponse } from "./client.js";

export type AnthropicLlmClientOptions = {
  apiKey: string;
  model: string;
  maxTokens: number;
  /** Inject for testing — defaults to real Anthropic SDK constructor. */
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
        messages: req.messages.map((m) => ({
          role: m.role === "system" ? "assistant" : m.role,
          content: m.content,
        })),
      } as never);
      type ContentBlock = { type: string; text?: string };
      const blocks = (result as { content: ContentBlock[] }).content;
      const textBlock = blocks.find(
        (b): b is ContentBlock & { type: "text"; text: string } =>
          b.type === "text" && typeof b.text === "string",
      );
      if (!textBlock)
        throw new Error("anthropic response had no text block");
      return { kind: "text", text: textBlock.text };
    },
  };
}
