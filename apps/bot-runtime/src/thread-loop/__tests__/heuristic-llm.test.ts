import { describe, it, expect } from 'vitest';

import { HeuristicLlmGuard, MessageGuard } from '../message-guard.js';

describe('HeuristicLlmGuard', () => {
  const g = new MessageGuard(new HeuristicLlmGuard());

  async function classify(text: string): Promise<string> {
    const d = await g.classify({
      threadId: 'th_x',
      messageId: 'ms_x',
      source: 'client',
      text,
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    return d.intent;
  }

  it('recognises progress queries', async () => {
    expect(await classify('what is the status')).toBe('progress_query');
    expect(await classify('any update')).toBe('progress_query');
  });

  it('recognises new task verbs', async () => {
    expect(await classify('draft a marketing plan')).toBe('new_task');
    expect(await classify('please build the feature')).toBe('new_task');
  });

  it('recognises plan updates', async () => {
    expect(await classify('change the plan to focus on iOS')).toBe('plan_update');
  });

  it('recognises cancel/pause/resume verbs', async () => {
    expect(await classify('please cancel this')).toBe('cancel_task');
    expect(await classify('pause for now')).toBe('pause_task');
    expect(await classify('resume the run')).toBe('resume_task');
  });

  it('defaults to chat for ambiguous text', async () => {
    expect(await classify('hi there')).toBe('chat');
  });
});
