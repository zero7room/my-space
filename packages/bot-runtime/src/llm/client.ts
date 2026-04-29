export type LlmMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export type LlmToolDef = {
  name: string;
  description: string;
  inputSchemaJson: unknown;
};

export type LlmRequest = {
  system: string;
  messages: LlmMessage[];
  tools: LlmToolDef[];
  temperature?: number;
  responseFormat?: "text" | "json";
};

export type LlmResponse =
  | { kind: "text"; text: string }
  | { kind: "tool_call"; toolName: string; input: Record<string, unknown>; id: string }
  | { kind: "json"; data: unknown };

export type LlmClient = {
  complete(req: LlmRequest): Promise<LlmResponse>;
};

export function createStubLlmClient(
  cannedByLastUser: Record<string, LlmResponse>,
  fallback?: LlmResponse,
): LlmClient {
  return {
    async complete(req) {
      const last = [...req.messages].reverse().find((m) => m.role === "user");
      const key = last?.content ?? "";
      if (key in cannedByLastUser) return cannedByLastUser[key]!;
      if (fallback) return fallback;
      throw new Error(`stub LLM has no canned reply for: ${key}`);
    },
  };
}
