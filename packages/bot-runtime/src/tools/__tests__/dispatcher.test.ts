import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createDispatcher } from "../dispatcher.js";
import { defineTool } from "../tool.js";

describe("Tool Dispatcher", () => {
  function ctx() {
    return {
      runtimeId: "rt-1",
      threadId: "th-1",
      taskId: "tk-1",
      fencingToken: 1,
      now: () => "2026-04-28T00:00:00Z",
    };
  }

  it("dispatches to registered tool", async () => {
    const tool = defineTool({
      name: "echo",
      description: "",
      readOnly: true,
      destructive: false,
      concurrencySafe: true,
      requiresApproval: false,
      input: z.object({ msg: z.string() }),
      output: z.object({ msg: z.string() }),
      async call({ msg }) {
        return { msg };
      },
    });
    const d = createDispatcher({ tools: [tool], policies: [] });
    const result = await d.dispatch({
      toolName: "echo",
      input: { msg: "hi" },
      ctx: ctx(),
    });
    expect(result.outcome).toBe("ok");
    if (result.outcome === "ok") expect(result.output).toEqual({ msg: "hi" });
  });

  it("returns critical_node when policy require_approval matches", async () => {
    const tool = defineTool({
      name: "bash",
      description: "",
      readOnly: false,
      destructive: true,
      concurrencySafe: false,
      requiresApproval: false,
      input: z.object({ command: z.string() }),
      output: z.object({ stdout: z.string() }),
      async call({ command }) {
        return { stdout: command };
      },
    });
    const d = createDispatcher({
      tools: [tool],
      policies: [
        {
          id: "p1",
          scope: "user",
          matcher: { kind: "tool", toolName: "bash" },
          action: "require_approval",
          ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
          enabled: true,
          createdAt: "2026-04-28T00:00:00Z",
        },
      ],
    });
    const result = await d.dispatch({
      toolName: "bash",
      input: { command: "ls" },
      ctx: ctx(),
    });
    expect(result.outcome).toBe("critical_node");
  });

  it("returns blocked when policy action is block", async () => {
    const tool = defineTool({
      name: "rm",
      description: "",
      readOnly: false,
      destructive: true,
      concurrencySafe: false,
      requiresApproval: false,
      input: z.object({ path: z.string() }),
      output: z.object({}),
      async call() {
        return {};
      },
    });
    const d = createDispatcher({
      tools: [tool],
      policies: [
        {
          id: "p2",
          scope: "user",
          matcher: { kind: "tool", toolName: "rm" },
          action: "block",
          ownerUserId: "u_018f5d20-0000-7000-8000-000000000001",
          enabled: true,
          createdAt: "2026-04-28T00:00:00Z",
        },
      ],
    });
    const result = await d.dispatch({
      toolName: "rm",
      input: { path: "x" },
      ctx: ctx(),
    });
    expect(result.outcome).toBe("blocked");
  });

  it("rejects unknown tool", async () => {
    const d = createDispatcher({ tools: [], policies: [] });
    const result = await d.dispatch({
      toolName: "ghost",
      input: {},
      ctx: ctx(),
    });
    expect(result.outcome).toBe("unknown_tool");
  });
});
