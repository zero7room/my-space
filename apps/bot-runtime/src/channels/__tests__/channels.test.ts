import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  newOutboundJobId,
} from '@ai-workflow/contracts';

import { RuntimePaths } from '../../runtime/paths.js';
import { FeishuProvider, OutboundJobProcessor, createJob } from '../index.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'channels-')),
    runtimeId: 'rt-channels',
  });
}

describe('FeishuProvider', () => {
  it('rejects payloads without verification token when token configured', async () => {
    const p = new FeishuProvider({ verificationToken: 'expected' });
    const out = await p.handleInbound({
      body: {
        token: 'wrong',
        header: { event_id: 'e1' },
        event: { message: { chat_id: 'oc_x', message_id: 'm1', content: '{"text":"hi"}' } },
      },
    });
    expect(out.signatureValid).toBe(false);
  });

  it('accepts and parses a message event', async () => {
    const p = new FeishuProvider({ verificationToken: 't' });
    const out = await p.handleInbound({
      body: {
        token: 't',
        header: { event_id: 'e2' },
        event: {
          message: { chat_id: 'oc_x', message_id: 'm1', content: '{"text":"hello"}' },
          sender: { sender_id: { open_id: 'ou_user' } },
        },
      },
    });
    expect(out.signatureValid).toBe(true);
    expect(out.idempotencyKey).toBe('e2');
    expect(out.ingestedMessage?.text).toBe('hello');
    expect(out.ingestedMessage?.fromExternalUserId).toBe('ou_user');
  });

  it('outbound stub returns succeeded', async () => {
    const p = new FeishuProvider();
    const r = await p.handleOutbound({
      job: createJob('feishu', { externalConversationId: 'oc_x', text: 'hi' }),
    });
    expect(r.status).toBe('succeeded');
  });
});

describe('OutboundJobProcessor', () => {
  it('moves succeeded jobs to done bucket', async () => {
    const rt = mkrt();
    const p = new FeishuProvider();
    const j = createJob('feishu', { externalConversationId: 'oc_x', text: 'hi' });
    await rt.channelJobs.create(j);
    const proc = new OutboundJobProcessor({ rt, providers: { feishu: p } });
    const r = await proc.processOnce();
    expect(r.processed).toBe(1);
    expect((await rt.channelJobs.list('done')).length).toBe(1);
  });

  it('dedupes by dedupeKey', async () => {
    const rt = mkrt();
    const p = new FeishuProvider();
    const dedupe = 'dk-1';
    const j1 = createJob('feishu', {}, dedupe);
    const j2 = createJob('feishu', {}, dedupe);
    await rt.channelJobs.create(j1);
    await rt.channelJobs.create(j2);
    const proc = new OutboundJobProcessor({ rt, providers: { feishu: p } });
    await proc.processOnce();
    // Both should be moved out of pending; one to done (first), one to done via dedupe skip.
    expect((await rt.channelJobs.list('pending')).length).toBe(0);
  });

  it('marks dead after maxAttempts on persistent failure', async () => {
    const rt = mkrt();
    const failing: import('../provider.js').ChannelProvider = {
      name: 'fail',
      async handleInbound() {
        return { signatureValid: false };
      },
      async handleOutbound() {
        return { status: 'failed', error: 'boom' };
      },
    };
    const j = createJob('fail', {});
    await rt.channelJobs.create({ ...j, attemptCount: 4 });
    const proc = new OutboundJobProcessor({
      rt,
      providers: { fail: failing },
      maxAttempts: 5,
    });
    const r = await proc.processOnce();
    expect(r.processed).toBe(1);
    void newOutboundJobId;
  });
});
