/**
 * Outbound job processor: pull jobs from `jobs/pending`, run via the channel
 * provider, then move to `done` or `failed` (or `dead` after maxAttempts).
 *
 * Idempotency: caller-supplied `dedupeKey` is exclusively claimed via
 * `state/jobs/dedupe/<key>` (O_CREAT|O_EXCL). Conflict means duplicate; skip.
 */
import {
  type ChannelJob,
  channelJobSchema,
} from '@ai-workflow/contracts';
import {
  exclusiveCreateJson,
  ExclusiveCreateConflictError,
} from '@ai-workflow/fs-store';

import type { RuntimePaths } from '../runtime/paths.js';
import { NotifyThrottle } from '../retry/index.js';

import type { ChannelProvider } from './provider.js';

export interface JobProcessorOptions {
  rt: RuntimePaths;
  providers: Record<string, ChannelProvider>;
  throttle?: NotifyThrottle;
  maxAttempts?: number;
  now?: () => number;
}

export class OutboundJobProcessor {
  constructor(private readonly opts: JobProcessorOptions) {}

  async processOnce(): Promise<{ processed: number }> {
    const { rt, providers } = this.opts;
    const maxAttempts = this.opts.maxAttempts ?? 5;
    const pending = await rt.channelJobs.list('pending');
    let processed = 0;

    for (const j of pending) {
      const provider = providers[j.provider];
      if (!provider) continue;

      // Idempotency claim.
      if (j.dedupeKey) {
        try {
          await exclusiveCreateJson(rt.paths.jobDedupeFile(j.dedupeKey), {
            jobId: j.id,
            createdAt: new Date().toISOString(),
          });
        } catch (err) {
          if (err instanceof ExclusiveCreateConflictError) {
            await rt.channelJobs.move(j, 'pending', 'done');
            continue;
          }
          throw err;
        }
      }

      // Throttle outbound by external conversation id where present.
      const externalId = (j.payload['externalConversationId'] as string | undefined) ?? '';
      if (
        externalId &&
        this.opts.throttle &&
        !this.opts.throttle.consume(j.provider, externalId)
      ) {
        // Drop — caller decides whether to enqueue retry.
        const updated = channelJobSchema.parse({
          ...j,
          status: 'failed',
          attemptCount: j.attemptCount + 1,
          lastError: 'channel_notify_throttled',
          updatedAt: new Date().toISOString(),
        });
        await rt.channelJobs.create(updated);
        await rt.channelJobs.move(updated, 'pending', 'failed');
        processed++;
        continue;
      }

      await rt.channelJobs.move(j, 'pending', 'locked');
      try {
        const out = await provider.handleOutbound({ job: j });
        const next = channelJobSchema.parse({
          ...j,
          status: out.status,
          attemptCount: j.attemptCount + 1,
          result: out.result,
          lastError: out.error,
          updatedAt: new Date().toISOString(),
        });
        await rt.channelJobs.create(next);
        if (out.status === 'succeeded') {
          await rt.channelJobs.move(next, 'pending', 'done');
        } else if (next.attemptCount >= maxAttempts) {
          const dead = channelJobSchema.parse({ ...next, status: 'dead' });
          await rt.channelJobs.create(dead);
          await rt.channelJobs.move(dead, 'pending', 'failed');
        } else {
          await rt.channelJobs.move(next, 'pending', 'failed');
        }
      } catch (err) {
        const failed = channelJobSchema.parse({
          ...j,
          status: 'failed',
          attemptCount: j.attemptCount + 1,
          lastError: (err as Error).message,
          updatedAt: new Date().toISOString(),
        });
        await rt.channelJobs.create(failed);
        await rt.channelJobs.move(failed, 'pending', 'failed');
      }
      processed++;
    }
    return { processed };
  }
}

export function createJob(provider: string, payload: Record<string, unknown>, dedupeKey?: string): ChannelJob {
  const now = new Date().toISOString();
  return channelJobSchema.parse({
    id: 'oj_' + Math.random().toString(36).slice(2).padEnd(21, '0').slice(0, 21),
    provider,
    type: 'send_message',
    status: 'pending',
    dedupeKey,
    payload,
    attemptCount: 0,
    runAfter: now,
    createdAt: now,
    updatedAt: now,
  });
}
