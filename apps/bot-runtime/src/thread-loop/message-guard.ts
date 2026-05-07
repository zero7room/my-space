/**
 * MessageGuard: classifies an inbound text into a `GuardDecision.intent`.
 *
 * Phase 5 wires deterministic short-circuits + a rule-based fallback. The
 * structured-LLM adapter is plugged in via the `LlmGuardAdapter` interface
 * (left as a stub here — Phase 6/11 swap in a real model).
 *
 * Short-circuit rules (per design.md §15):
 *   - bound group: only `@bot`, reply-to-bot, slash command, or owner pending
 *     confirmation enters guard. Other group msgs → `irrelevant`.
 *   - unbound group: only Guardian binding commands enter guard.
 *   - client / private direct: default to LLM guard.
 *   - slash commands `/confirm`, `/cancel`, `/pause`, `/resume`, `/status` map
 *     to fixed intents.
 */
import {
  type GuardDecision,
  type Intent,
  newGuardDecisionId,
} from '@ai-workflow/contracts';

export interface GuardInput {
  threadId: string;
  messageId: string;
  fromUserId?: string;
  source: 'client' | 'lark_private' | 'lark_group' | 'slack' | string;
  text: string;
  /** Whether the thread already has a binding to this conversation. */
  bound: boolean;
  /** Whether this user is the owner of the thread (used for confirmations). */
  isOwner: boolean;
  /** Whether the thread has a pending confirmation owned by this user. */
  hasPendingConfirmation: boolean;
  /** Whether the message was @-mentioning the bot. */
  mentionedBot?: boolean;
  /** Whether the message replied to a bot message. */
  replyToBot?: boolean;
}

export interface LlmGuardAdapter {
  classify(input: GuardInput): Promise<GuardDecision | undefined>;
}

const SLASH_INTENTS: Record<string, Intent> = {
  '/confirm': 'confirm_task',
  '/yes': 'confirm_task',
  '/cancel': 'cancel_task',
  '/pause': 'pause_task',
  '/resume': 'resume_task',
  '/status': 'progress_query',
};

function ruleClassify(input: GuardInput): {
  intent: Intent;
  ruleHits: string[];
  shortCircuited: boolean;
  reason: string;
} {
  const text = input.text.trim();
  const lower = text.toLowerCase();

  // Slash command
  for (const [k, v] of Object.entries(SLASH_INTENTS)) {
    if (lower === k || lower.startsWith(`${k} `)) {
      return {
        intent: v,
        ruleHits: [`slash:${k}`],
        shortCircuited: true,
        reason: 'slash command',
      };
    }
  }

  if (input.source === 'lark_group') {
    if (!input.bound) {
      // Only bind-* commands count.
      if (lower.startsWith('@bot bind') || lower.startsWith('/bind')) {
        return {
          intent: 'chat',
          ruleHits: ['unbound_group:bind'],
          shortCircuited: true,
          reason: 'guardian binding command',
        };
      }
      return {
        intent: 'irrelevant',
        ruleHits: ['unbound_group:no_binding_cmd'],
        shortCircuited: true,
        reason: 'unbound group message',
      };
    }
    // Bound group — accept @bot, replyToBot, owner pending confirmation.
    const accept =
      input.mentionedBot ||
      input.replyToBot ||
      (input.hasPendingConfirmation && input.isOwner);
    if (!accept) {
      return {
        intent: 'irrelevant',
        ruleHits: ['bound_group:not_addressed'],
        shortCircuited: true,
        reason: 'bound group message not addressed to bot',
      };
    }
  }

  return {
    intent: 'chat',
    ruleHits: [],
    shortCircuited: false,
    reason: 'rule fallback to LLM',
  };
}

export class MessageGuard {
  constructor(
    private readonly llm?: LlmGuardAdapter,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async classify(input: GuardInput): Promise<GuardDecision> {
    const ruled = ruleClassify(input);
    const id = newGuardDecisionId();
    const at = this.now();

    if (ruled.shortCircuited) {
      return {
        id,
        messageId: input.messageId,
        threadId: input.threadId,
        fromUserId: input.fromUserId,
        source: input.source,
        intent: ruled.intent,
        targetTaskId: undefined,
        targetPlanId: undefined,
        shortCircuited: true,
        ruleHits: ruled.ruleHits,
        confidence: 1.0,
        requiresUserConfirmation: requiresConfirm(ruled.intent),
        reason: ruled.reason,
        createdAt: at,
      };
    }

    if (this.llm) {
      try {
        const llmRes = await this.llm.classify(input);
        if (llmRes) return llmRes;
      } catch {
        // fall through to degraded rule-based classification
      }
    }

    return {
      id,
      messageId: input.messageId,
      threadId: input.threadId,
      fromUserId: input.fromUserId,
      source: input.source,
      intent: ruled.intent,
      shortCircuited: false,
      ruleHits: ruled.ruleHits,
      confidence: 0.5,
      requiresUserConfirmation: requiresConfirm(ruled.intent),
      reason: 'guard_degraded',
      createdAt: at,
    };
  }
}

function requiresConfirm(intent: Intent): boolean {
  return (
    intent === 'new_task' ||
    intent === 'task_update' ||
    intent === 'plan_update'
  );
}
