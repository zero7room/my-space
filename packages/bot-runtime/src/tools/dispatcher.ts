import {
  type CriticalNodeDecision,
  evaluateCriticalNode,
} from "../executor/critical-node-policy.js";
import type { CriticalNodePolicy } from "../schema/critical-node.js";
import type { Tool, ToolContext } from "./tool.js";

export type DispatchInput = {
  toolName: string;
  input: Record<string, unknown>;
  ctx: ToolContext;
};

export type DispatchResult =
  | { outcome: "ok"; output: unknown }
  | { outcome: "critical_node"; decisions: CriticalNodeDecision[] }
  | { outcome: "blocked"; decisions: CriticalNodeDecision[] }
  | { outcome: "unknown_tool" }
  | { outcome: "error"; error: string };

export type Dispatcher = {
  dispatch(input: DispatchInput): Promise<DispatchResult>;
  withPolicies(policies: CriticalNodePolicy[]): Dispatcher;
};

export function createDispatcher(deps: {
  tools: Tool[];
  policies: CriticalNodePolicy[];
}): Dispatcher {
  const map = new Map(deps.tools.map((t) => [t.name, t]));
  return {
    async dispatch({ toolName, input, ctx }) {
      const tool = map.get(toolName);
      if (!tool) return { outcome: "unknown_tool" };

      const decisions = evaluateCriticalNode({
        toolName,
        input,
        policies: deps.policies,
      });
      const block = decisions.find((d) => d.action === "block");
      if (block) return { outcome: "blocked", decisions };
      const requireApproval = decisions.find((d) => d.action === "require_approval");
      if (requireApproval) return { outcome: "critical_node", decisions };

      try {
        const output = await tool.call(input, { ctx });
        return { outcome: "ok", output };
      } catch (err) {
        return { outcome: "error", error: (err as Error).message };
      }
    },
    withPolicies(next) {
      return createDispatcher({ tools: deps.tools, policies: next });
    },
  };
}
