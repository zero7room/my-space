/**
 * LLM adapter factory.
 *
 * Reads env vars to choose + configure an LLM backend:
 *
 *   LLM_PROVIDER   anthropic | openai | heuristic (default: heuristic)
 *   LLM_MODEL      e.g. `claude-opus-4-7`, `gpt-5`, or provider-specific.
 *   LLM_API_KEY    bearer credential for the provider.
 *   LLM_BASE_URL   override base URL (proxies / Azure / self-hosted).
 *   LLM_TIMEOUT_MS default 15_000.
 *
 * Falls back to `HeuristicLlmGuard` when no `LLM_API_KEY` is set or the
 * provider isn't recognised. This keeps local dev zero-config.
 */
import {
  type GuardDecision,
  newGuardDecisionId,
} from '@ai-workflow/contracts';

import {
  HeuristicLlmGuard,
  type GuardInput,
  type LlmGuardAdapter,
} from './message-guard.js';

export interface LlmEnv {
  LLM_PROVIDER?: string;
  LLM_MODEL?: string;
  LLM_API_KEY?: string;
  LLM_BASE_URL?: string;
  LLM_TIMEOUT_MS?: string;
}

export function resolveLlmGuardAdapter(env: LlmEnv = process.env as LlmEnv): LlmGuardAdapter {
  const provider = (env.LLM_PROVIDER ?? 'heuristic').toLowerCase();
  const apiKey = env.LLM_API_KEY ?? '';
  if (!apiKey || provider === 'heuristic') return new HeuristicLlmGuard();
  if (provider === 'anthropic') {
    return new AnthropicGuardAdapter({
      apiKey,
      model: env.LLM_MODEL ?? 'claude-opus-4-7',
      baseUrl: env.LLM_BASE_URL ?? 'https://api.anthropic.com',
      timeoutMs: Number.parseInt(env.LLM_TIMEOUT_MS ?? '15000', 10),
    });
  }
  if (provider === 'openai') {
    return new OpenAIGuardAdapter({
      apiKey,
      model: env.LLM_MODEL ?? 'gpt-4.1',
      baseUrl: env.LLM_BASE_URL ?? 'https://api.openai.com/v1',
      timeoutMs: Number.parseInt(env.LLM_TIMEOUT_MS ?? '15000', 10),
    });
  }
  return new HeuristicLlmGuard();
}

interface RemoteCfg {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

const INTENTS = [
  'chat',
  'new_task',
  'task_update',
  'plan_update',
  'confirm_task',
  'confirm_plan',
  'progress_query',
  'pause_task',
  'resume_task',
  'cancel_task',
  'irrelevant',
] as const;
type Intent = (typeof INTENTS)[number];

function isIntent(v: unknown): v is Intent {
  return typeof v === 'string' && (INTENTS as readonly string[]).includes(v);
}

const SYSTEM_PROMPT = `You are MessageGuard. Classify the user's last message into one of:
chat, new_task, task_update, plan_update, confirm_task, confirm_plan,
progress_query, pause_task, resume_task, cancel_task, irrelevant.

Reply with ONLY a JSON object:
{"intent": "<one of the above>", "confidence": 0..1, "reason": "<short>"}
Nothing else. No prose, no code fences.`;

/**
 * Anthropic Messages API adapter. Uses the native non-streaming request and
 * parses the first text block as JSON.
 */
export class AnthropicGuardAdapter implements LlmGuardAdapter {
  constructor(private readonly cfg: RemoteCfg) {}

  async classify(input: GuardInput): Promise<GuardDecision | undefined> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(`${this.cfg.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'x-api-key': this.cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.cfg.model,
          max_tokens: 200,
          system: SYSTEM_PROMPT,
          messages: [
            {
              role: 'user',
              content: buildClassifyPrompt(input),
            },
          ],
        }),
        signal: ac.signal,
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = json.content?.find((c) => c.type === 'text')?.text ?? '';
      return parseDecision(text, input);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * OpenAI Responses/Chat Completions adapter (uses Chat Completions for broad
 * compatibility with proxies / Azure). Returns the first message's content as
 * JSON.
 */
export class OpenAIGuardAdapter implements LlmGuardAdapter {
  constructor(private readonly cfg: RemoteCfg) {}

  async classify(input: GuardInput): Promise<GuardDecision | undefined> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(`${this.cfg.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.cfg.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.cfg.model,
          temperature: 0,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildClassifyPrompt(input) },
          ],
          response_format: { type: 'json_object' },
        }),
        signal: ac.signal,
      });
      if (!res.ok) return undefined;
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = json.choices?.[0]?.message?.content ?? '';
      return parseDecision(text, input);
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}

function buildClassifyPrompt(input: GuardInput): string {
  return [
    `source=${input.source}`,
    `bound=${input.bound}`,
    `isOwner=${input.isOwner}`,
    `hasPendingConfirmation=${input.hasPendingConfirmation}`,
    `message: ${input.text}`,
  ].join('\n');
}

function parseDecision(text: string, input: GuardInput): GuardDecision | undefined {
  try {
    const parsed = JSON.parse(text.trim()) as {
      intent?: unknown;
      confidence?: unknown;
      reason?: unknown;
    };
    if (!isIntent(parsed.intent)) return undefined;
    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : 0.7;
    return {
      id: newGuardDecisionId(),
      messageId: input.messageId,
      threadId: input.threadId,
      fromUserId: input.fromUserId,
      source: input.source,
      intent: parsed.intent,
      shortCircuited: false,
      ruleHits: ['llm'],
      confidence,
      requiresUserConfirmation:
        parsed.intent === 'new_task' ||
        parsed.intent === 'task_update' ||
        parsed.intent === 'plan_update',
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'llm',
      createdAt: new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}
