import { describe, it, expect } from 'vitest';

import { MessageGuard } from '../message-guard.js';

describe('MessageGuard rule short-circuits', () => {
  const g = new MessageGuard();

  it('classifies slash /confirm', async () => {
    const d = await g.classify({
      threadId: 'th_x',
      messageId: 'ms_x',
      source: 'client',
      text: '/confirm',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: true,
    });
    expect(d.intent).toBe('confirm_task');
    expect(d.shortCircuited).toBe(true);
  });

  it('classifies /pause /resume /cancel /status', async () => {
    const cases: [string, string][] = [
      ['/pause', 'pause_task'],
      ['/resume', 'resume_task'],
      ['/cancel', 'cancel_task'],
      ['/status', 'progress_query'],
    ];
    for (const [text, expectedIntent] of cases) {
      const d = await g.classify({
        threadId: 'th_x',
        messageId: 'ms_x',
        source: 'client',
        text,
        bound: true,
        isOwner: true,
        hasPendingConfirmation: false,
      });
      expect(d.intent).toBe(expectedIntent);
    }
  });

  it('marks unbound group non-bind messages irrelevant', async () => {
    const d = await g.classify({
      threadId: 'th_x',
      messageId: 'ms_x',
      source: 'lark_group',
      text: 'standup at 11',
      bound: false,
      isOwner: false,
      hasPendingConfirmation: false,
    });
    expect(d.intent).toBe('irrelevant');
  });

  it('falls through to chat for client text', async () => {
    const d = await g.classify({
      threadId: 'th_x',
      messageId: 'ms_x',
      source: 'client',
      text: 'draft a marketing plan',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    expect(d.intent).toBe('chat');
  });

  it('emits guard_degraded reason when LLM is absent', async () => {
    const d = await g.classify({
      threadId: 'th_x',
      messageId: 'ms_x',
      source: 'client',
      text: 'plan something',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    expect(d.reason).toBe('guard_degraded');
  });

  it('uses LLM adapter when present', async () => {
    const guarded = new MessageGuard({
      classify: async () => ({
        id: 'gd_aaaaaaaaaaaaaaaaaaaaa',
        messageId: 'ms_x',
        threadId: 'th_x',
        source: 'client',
        intent: 'new_task',
        shortCircuited: false,
        ruleHits: ['llm'],
        confidence: 0.9,
        requiresUserConfirmation: true,
        reason: 'llm classification',
        createdAt: '2026-05-07T00:00:00.000Z',
      }),
    });
    const d = await guarded.classify({
      threadId: 'th_x',
      messageId: 'ms_x',
      source: 'client',
      text: 'plan launch',
      bound: true,
      isOwner: true,
      hasPendingConfirmation: false,
    });
    expect(d.intent).toBe('new_task');
  });
});
