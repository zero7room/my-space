import type { LongConnectionAdapter } from "../../ingress/long-connection.js";

export type FeishuLongConnectionInput = {
  enabled: boolean;
};

export function createFeishuLongConnection(
  input: FeishuLongConnectionInput,
): LongConnectionAdapter {
  if (!input.enabled) {
    return {
      async start() {
        return;
      },
      async stop() {
        return;
      },
    };
  }
  return {
    async start() {
      throw new Error("Feishu LongConnection not implemented in v1; use webhookEnabled=true");
    },
    async stop() {
      return;
    },
  };
}
