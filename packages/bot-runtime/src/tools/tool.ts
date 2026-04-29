import type { z } from "zod";

export type ToolContext = {
  runtimeId: string;
  threadId: string;
  taskId: string;
  fencingToken: number;
  now(): string;
};

export type ToolDefinition<I, O> = {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  concurrencySafe: boolean;
  requiresApproval: boolean;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  call(args: I, env: { ctx: ToolContext }): Promise<O>;
};

export type Tool = {
  name: string;
  description: string;
  readOnly: boolean;
  destructive: boolean;
  concurrencySafe: boolean;
  requiresApproval: boolean;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  call(args: unknown, env: { ctx: ToolContext }): Promise<unknown>;
};

export function defineTool<I, O>(d: ToolDefinition<I, O>): Tool {
  return {
    name: d.name,
    description: d.description,
    readOnly: d.readOnly,
    destructive: d.destructive,
    concurrencySafe: d.concurrencySafe,
    requiresApproval: d.requiresApproval,
    inputSchema: d.input,
    outputSchema: d.output,
    async call(args, env) {
      const validated = d.input.parse(args);
      const result = await d.call(validated, env);
      return d.output.parse(result);
    },
  };
}
