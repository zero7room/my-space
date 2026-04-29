import type { GuardIntent } from "../schema/guard-decision.js";

export type FallbackInput = {
  messageText: string;
  slashCommand: "confirm" | "cancel" | "status" | null;
};

export type FallbackOutput = {
  intent: GuardIntent;
  confidence: number;
  reason: string;
};

export function fallbackClassify(input: FallbackInput): FallbackOutput {
  if (input.slashCommand === "confirm") {
    return {
      intent: "confirm_task",
      confidence: 1,
      reason: "rule fallback: explicit /confirm",
    };
  }
  if (input.slashCommand === "cancel") {
    return {
      intent: "cancel_task",
      confidence: 1,
      reason: "rule fallback: explicit /cancel",
    };
  }
  if (input.slashCommand === "status") {
    return {
      intent: "progress_query",
      confidence: 1,
      reason: "rule fallback: explicit /status",
    };
  }
  return {
    intent: "chat",
    confidence: 0.1,
    reason: "rule fallback (LLM degraded); defaulting to chat",
  };
}
