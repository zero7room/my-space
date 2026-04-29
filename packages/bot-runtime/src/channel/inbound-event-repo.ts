import {
  type ChannelInboundEvent,
  ChannelInboundEventSchema,
  type Provider,
} from "../schema/channel.js";
import { newId } from "../storage/ids.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type RecordReceivedInput = {
  externalMessageId?: string;
};

export type InboundEventRepo = {
  recordReceived(
    provider: Provider,
    externalEventId: string,
    input: RecordReceivedInput,
  ): Promise<ChannelInboundEvent>;
  isDuplicate(provider: Provider, externalEventId: string): Promise<boolean>;
  load(provider: Provider, externalEventId: string): Promise<ChannelInboundEvent | null>;
  markProcessed(provider: Provider, externalEventId: string): Promise<ChannelInboundEvent>;
  markSkipped(
    provider: Provider,
    externalEventId: string,
    reason: string,
  ): Promise<ChannelInboundEvent>;
  markFailed(
    provider: Provider,
    externalEventId: string,
    reason: string,
  ): Promise<ChannelInboundEvent>;
};

export function createInboundEventRepo(paths: Paths, runtimeId: string): InboundEventRepo {
  function file(provider: Provider, externalEventId: string) {
    return paths.webhookEvent(runtimeId, provider, externalEventId);
  }

  async function transition(
    provider: Provider,
    externalEventId: string,
    next: ChannelInboundEvent["status"],
    extra: Partial<ChannelInboundEvent> = {},
  ) {
    const cur = await readJson(file(provider, externalEventId));
    if (!cur) throw new Error(`inbound event ${provider}/${externalEventId} not found`);
    const parsed = ChannelInboundEventSchema.parse(cur);
    const updated = ChannelInboundEventSchema.parse({
      ...parsed,
      ...extra,
      id: parsed.id,
      provider: parsed.provider,
      externalEventId: parsed.externalEventId,
      createdAt: parsed.createdAt,
      status: next,
    });
    await writeJson(file(provider, externalEventId), updated);
    return updated;
  }

  return {
    async recordReceived(provider, externalEventId, input) {
      const now = new Date().toISOString();
      const event = ChannelInboundEventSchema.parse({
        id: newId("ie"),
        provider,
        externalEventId,
        externalMessageId: input.externalMessageId,
        status: "received",
        payloadRef: file(provider, externalEventId),
        createdAt: now,
      });
      await writeJson(file(provider, externalEventId), event);
      return event;
    },
    async isDuplicate(provider, externalEventId) {
      const got = await readJson(file(provider, externalEventId));
      return got !== null;
    },
    async load(provider, externalEventId) {
      const got = await readJson(file(provider, externalEventId));
      return got ? ChannelInboundEventSchema.parse(got) : null;
    },
    async markProcessed(provider, externalEventId) {
      return transition(provider, externalEventId, "processed", {
        processedAt: new Date().toISOString(),
      });
    },
    async markSkipped(provider, externalEventId, _reason) {
      return transition(provider, externalEventId, "skipped");
    },
    async markFailed(provider, externalEventId, _reason) {
      return transition(provider, externalEventId, "failed");
    },
  };
}
