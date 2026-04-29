import type { GuardIntent, GuardSource } from "../schema/guard-decision.js";

export type RuleInput = {
  source: GuardSource;
  bound: boolean;
  mentionsBot: boolean;
  replyToBotMessage: boolean;
  slashCommand: "confirm" | "cancel" | "status" | null;
  threadStatus: "chatting" | "planning" | "waiting_confirmation" | "working" | "blocked" | "idle";
};

export type RuleEvaluation = {
  shortCircuit: boolean;
  intent: GuardIntent;
  ruleHits: string[];
  reason: string;
};

export function evaluateRules(input: RuleInput): RuleEvaluation {
  if (input.source === "lark_group" && !input.bound) {
    return {
      shortCircuit: true,
      intent: "irrelevant",
      ruleHits: ["unbound_group_silent"],
      reason: "unbound group messages do not enter business thread",
    };
  }
  if (input.source === "lark_group" && input.bound) {
    const triggered =
      input.mentionsBot ||
      input.replyToBotMessage ||
      input.slashCommand !== null ||
      input.threadStatus === "waiting_confirmation";
    if (!triggered) {
      return {
        shortCircuit: true,
        intent: "irrelevant",
        ruleHits: ["bound_group_silent"],
        reason: "bound group, no @bot or reply to bot",
      };
    }
    if (input.slashCommand === "confirm") {
      return {
        shortCircuit: true,
        intent: "confirm_task",
        ruleHits: ["slash_confirm"],
        reason: "explicit /confirm command",
      };
    }
    if (input.slashCommand === "cancel") {
      return {
        shortCircuit: true,
        intent: "cancel_task",
        ruleHits: ["slash_cancel"],
        reason: "explicit /cancel command",
      };
    }
    if (input.slashCommand === "status") {
      return {
        shortCircuit: true,
        intent: "progress_query",
        ruleHits: ["slash_status"],
        reason: "explicit /status command",
      };
    }
  }
  return {
    shortCircuit: false,
    intent: "chat",
    ruleHits: [],
    reason: "deferred to LLM classifier",
  };
}
