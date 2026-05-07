/**
 * Acceptance #43 regression — notify_throttled diagnostic.
 *
 * When the outbound throttle suppresses a job, the processor must leave a
 * diagnostic record under `state/_diagnostics/notify-throttled/` so operators
 * can correlate suppression bursts with task-level retry storms.
 */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { RuntimePaths } from '../../runtime/paths.js';
import {
  FeishuProvider,
  OutboundJobProcessor,
  createJob,
} from '../index.js';
import { NotifyThrottle } from '../../retry/notify-throttle.js';

function mkrt(): RuntimePaths {
  return new RuntimePaths({
    workspaceRoot: mkdtempSync(path.join(tmpdir(), 'notify-throttle-')),
    runtimeId: 'rt-throttle',
  });
}

describe('Acceptance #43 — notify_throttled diagnostic', () => {
  it('writes notify_throttled record when throttle suppresses an outbound job', async () => {
    const rt = mkrt();
    const provider = new FeishuProvider();
    const throttle = new NotifyThrottle({ capacity: 1, refillPerSec: 0 });
    // Pre-consume the only token so the next outbound is throttled.
    expect(throttle.consume('feishu', 'oc_x')).toBe(true);
    expect(throttle.consume('feishu', 'oc_x')).toBe(false);

    const j = createJob('feishu', { externalConversationId: 'oc_x', text: 'hi' });
    await rt.channelJobs.create(j);
    const proc = new OutboundJobProcessor({
      rt,
      providers: { feishu: provider },
      throttle,
    });
    await proc.processOnce();

    const dir = path.join(rt.paths.diagnosticsRoot(), 'notify-throttled');
    const entries = readdirSync(dir);
    expect(entries.length).toBeGreaterThan(0);
    const body = readFileSync(path.join(dir, entries[0]!), 'utf8').trim();
    const parsed = JSON.parse(body);
    expect(parsed.kind).toBe('notify_throttled');
    expect(parsed.providerId).toBe('feishu');
    expect(parsed.target).toBe('oc_x');
    expect(parsed.reason).toBe('duplicate_retry_window');
  });
});
