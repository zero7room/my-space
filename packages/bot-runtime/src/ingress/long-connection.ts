import type { WebhookHandler } from "./webhook-handler.js";

export type LongConnectionAdapter = {
  start(deliver: WebhookHandler): Promise<void>;
  stop(): Promise<void>;
};

export type LongConnectionHandle = {
  close(): Promise<void>;
};

export async function runLongConnection(
  adapter: LongConnectionAdapter,
  deliver?: WebhookHandler,
): Promise<LongConnectionHandle> {
  await adapter.start(deliver ?? (async () => ({ status: 200, body: { ok: true } })));
  return {
    async close() {
      await adapter.stop();
    },
  };
}

export function createNoopLongConnection(): LongConnectionAdapter {
  return {
    async start() {
      return;
    },
    async stop() {
      return;
    },
  };
}
