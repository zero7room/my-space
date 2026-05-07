import { describe, it, expect } from 'vitest';

import { HeuristicLlmGuard } from '../message-guard.js';
import {
  AnthropicGuardAdapter,
  OpenAIGuardAdapter,
  resolveLlmGuardAdapter,
} from '../llm-factory.js';

describe('resolveLlmGuardAdapter', () => {
  it('defaults to HeuristicLlmGuard when no api key', () => {
    expect(resolveLlmGuardAdapter({})).toBeInstanceOf(HeuristicLlmGuard);
  });

  it('returns HeuristicLlmGuard when provider=heuristic even with key', () => {
    expect(
      resolveLlmGuardAdapter({ LLM_PROVIDER: 'heuristic', LLM_API_KEY: 'k' }),
    ).toBeInstanceOf(HeuristicLlmGuard);
  });

  it('returns AnthropicGuardAdapter when provider=anthropic', () => {
    const a = resolveLlmGuardAdapter({
      LLM_PROVIDER: 'anthropic',
      LLM_API_KEY: 'sk-ant-x',
      LLM_MODEL: 'claude-opus-4-7',
    });
    expect(a).toBeInstanceOf(AnthropicGuardAdapter);
  });

  it('returns OpenAIGuardAdapter when provider=openai', () => {
    const a = resolveLlmGuardAdapter({
      LLM_PROVIDER: 'openai',
      LLM_API_KEY: 'sk-x',
    });
    expect(a).toBeInstanceOf(OpenAIGuardAdapter);
  });

  it('unknown provider falls back to heuristic', () => {
    expect(
      resolveLlmGuardAdapter({ LLM_PROVIDER: 'mystery', LLM_API_KEY: 'k' }),
    ).toBeInstanceOf(HeuristicLlmGuard);
  });
});
