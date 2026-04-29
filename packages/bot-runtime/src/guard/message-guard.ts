import type { LlmClient } from "../llm/client.js";
import type { GuardIntent, GuardSource } from "../schema/guard-decision.js";
import { fallbackClassify } from "./fallback.js";
import { classifyIntentWithLlm } from "./llm-classifier.js";
import { type RuleInput, evaluateRules } from "./rules.js";

export type ClassifyInput = RuleInput & {
  messageText: string;
  pendingTaskId: string | undefined;
  pendingPlanId: string | undefined;
};

export type GuardClassification = {
  intent: GuardIntent;
  confidence: number;
  reason: string;
  shortCircuited: boolean;
  ruleHits: string[];
  targetTaskId: string | undefined;
  targetPlanId: string | undefined;
};

export type MessageGuard = {
  classify(input: ClassifyInput): Promise<GuardClassification>;
};

export function createMessageGuard(deps: { llm: LlmClient }): MessageGuard {
  return {
    async classify(input) {
      const rules = evaluateRules(input);
      if (rules.shortCircuit) {
        return {
          intent: rules.intent,
          confidence: 1,
          reason: rules.reason,
          shortCircuited: true,
          ruleHits: rules.ruleHits,
          targetTaskId: undefined,
          targetPlanId: undefined,
        };
      }
      try {
        const llmOut = await classifyIntentWithLlm({
          llm: deps.llm,
          threadStatus: input.threadStatus,
          pendingTaskId: input.pendingTaskId,
          pendingPlanId: input.pendingPlanId,
          messageText: input.messageText,
        });
        return {
          intent: llmOut.intent,
          confidence: llmOut.confidence,
          reason: llmOut.reason,
          shortCircuited: false,
          ruleHits: [],
          targetTaskId: llmOut.targetTaskId,
          targetPlanId: llmOut.targetPlanId,
        };
      } catch (err) {
        const fb = fallbackClassify({
          messageText: input.messageText,
          slashCommand: input.slashCommand,
        });
        return {
          intent: fb.intent,
          confidence: fb.confidence,
          reason: `${fb.reason} (cause: ${(err as Error).message})`,
          shortCircuited: false,
          ruleHits: ["llm_degraded"],
          targetTaskId: undefined,
          targetPlanId: undefined,
        };
      }
    },
  };
}

export type { GuardIntent, GuardSource };
