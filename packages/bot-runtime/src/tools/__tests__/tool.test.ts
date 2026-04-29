import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "../tool.js";

describe("defineTool", () => {
  it("rejects calls with invalid input", async () => {
    const echo = defineTool({
      name: "echo",
      description: "echo back",
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      requiresApproval: false,
      input: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async call(args) {
        return { msg: args.msg };
      },
    });
    await expect(echo.call({} as never, { ctx: minimalCtx() })).rejects.toThrow();
  });

  it("validates output", async () => {
    const tool = defineTool({
      name: "bad",
      description: "",
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      requiresApproval: false,
      input: z.object({}),
      output: z.object({ n: z.number() }),
      async call() {
        return { n: "string" } as unknown as { n: number };
      },
    });
    await expect(tool.call({}, { ctx: minimalCtx() })).rejects.toThrow();
  });
});

function minimalCtx() {
  return {
    runtimeId: "rt-1",
    threadId: "th-1",
    taskId: "tk-1",
    fencingToken: 1,
    now: () => "2026-04-28T00:00:00Z",
  };
}
