import type { ChannelOutboundJobQueue } from "./outbound-job-queue.js";
import type { ProviderRegistry } from "./provider-registry.js";
import type { SendMessageInput } from "./provider.js";

export type ChannelOutboundRunnerOptions = {
  queue: ChannelOutboundJobQueue;
  registry: ProviderRegistry;
  maxAttempts?: number;
};

export type ChannelOutboundRunner = {
  tickOnce(): Promise<{ processed: number }>;
};

export function createChannelOutboundRunner(
  opts: ChannelOutboundRunnerOptions,
): ChannelOutboundRunner {
  const maxAttempts = opts.maxAttempts ?? 5;

  return {
    async tickOnce() {
      const pending = await opts.queue.listPending();
      let processed = 0;
      for (const job of pending) {
        const provider = opts.registry.get(job.provider);
        if (!provider) {
          await opts.queue.markFailed(job.id, `provider ${job.provider} not registered`, false);
          continue;
        }
        try {
          await opts.queue.markRunning(job.id);
          if (job.type === "send_message") {
            const result = await provider.sendMessage(job.payload as unknown as SendMessageInput);
            await opts.queue.markSucceeded(job.id, result as unknown as Record<string, unknown>);
          } else if (job.type === "create_conversation") {
            const result = await provider.createConversation(
              job.payload as unknown as Parameters<typeof provider.createConversation>[0],
            );
            await opts.queue.markSucceeded(job.id, result as unknown as Record<string, unknown>);
          } else if (job.type === "delete_conversation") {
            await provider.deleteConversation(
              job.payload as unknown as { externalConversationId: string },
            );
            await opts.queue.markSucceeded(job.id, {});
          } else {
            await opts.queue.markFailed(job.id, `unknown job type ${job.type}`, true);
          }
          processed += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const dead = job.attemptCount + 1 >= maxAttempts;
          await opts.queue.markFailed(job.id, message, dead);
        }
      }
      return { processed };
    },
  };
}
