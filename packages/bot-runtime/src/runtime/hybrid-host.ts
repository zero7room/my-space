import { mountAdminApi } from "../api/mount.js";
import { createChannelConfigStore } from "../channel/config-store.js";
import type { ChannelConfigStore } from "../channel/config-store.js";
import { createInboundEventRepo } from "../channel/inbound-event-repo.js";
import { createChannelOutboundJobQueue } from "../channel/outbound-job-queue.js";
import { createChannelOutboundRunner } from "../channel/outbound-runner.js";
import type { ChannelOutboundRunner } from "../channel/outbound-runner.js";
import { createProviderRegistry } from "../channel/provider-registry.js";
import type { ProviderRegistry } from "../channel/provider-registry.js";
import { recoverOnBoot } from "../executor/recovery-on-boot.js";
import { createGuardianThreadBootstrap } from "../guardian/thread-bootstrap.js";
import { createUserDirectory } from "../guardian/user-bootstrap.js";
import { createBindingLookup } from "../ingress/binding-lookup.js";
import { createIngressServer } from "../ingress/http-server.js";
import { createWebhookHandler } from "../ingress/webhook-handler.js";
import type { LlmClient } from "../llm/client.js";
import { parseFeishuConfig, resolveFeishuSecrets } from "../providers/feishu/config.js";
import { createFeishuProviderFromConfig } from "../providers/feishu/factory.js";
import type { TenantTokenFetchResult } from "../providers/feishu/token-cache.js";
import { type ReleaseLock, acquireInstanceLock } from "../storage/lock.js";
import type { Paths } from "../storage/paths.js";
import { type MasterHost, createMasterHost } from "./master-host.js";
import { type WorkerHost, createWorkerHost } from "./worker-host.js";

export type ChannelConfig = {
  adminToken: string;
  ingressPort?: number;
  env?: Record<string, string | undefined>;
  botOpenIdProvider?: () => string;
  fetchToken?: (input: { appId: string; appSecret: string }) => Promise<TenantTokenFetchResult>;
};

export type CreateHybridHostInput = {
  paths: Paths;
  runtimeId: string;
  guardLlm: LlmClient;
  draftLlm: LlmClient;
  execLlm: LlmClient;
  systemPrompt: string;
  maxSteps: number;
  leaseMs: number;
  channel?: ChannelConfig;
};

export type HybridHost = {
  master: MasterHost;
  worker: WorkerHost;
  close(): Promise<void>;
  outboundRunner: ChannelOutboundRunner;
  providerRegistry: ProviderRegistry;
  ingressPort: number;
  channelStore: ChannelConfigStore;
};

export async function createHybridHost(input: CreateHybridHostInput): Promise<HybridHost> {
  const release: ReleaseLock = await acquireInstanceLock(input.paths, input.runtimeId, {
    role: "hybrid",
  });
  await recoverOnBoot(input.paths, input.runtimeId, { dedupeRetentionDays: 30 });

  const master = await createMasterHost({
    paths: input.paths,
    runtimeId: input.runtimeId,
    guardLlm: input.guardLlm,
    draftLlm: input.draftLlm,
    systemPrompt: input.systemPrompt,
    existingLock: { release: async () => undefined, skipBoot: true },
  });
  const worker = await createWorkerHost({
    paths: input.paths,
    runtimeId: input.runtimeId,
    llm: input.execLlm,
    systemPrompt: input.systemPrompt,
    maxSteps: input.maxSteps,
    leaseMs: input.leaseMs,
    existingLock: { release: async () => undefined, skipBoot: true },
  });

  if (!input.channel) {
    return {
      master,
      worker,
      outboundRunner: undefined as unknown as ChannelOutboundRunner,
      providerRegistry: undefined as unknown as ProviderRegistry,
      ingressPort: undefined as unknown as number,
      channelStore: undefined as unknown as ChannelConfigStore,
      async close() {
        await master.close();
        await worker.close();
        await release();
      },
    };
  }

  const {
    adminToken,
    ingressPort: configuredPort = 0,
    env = {},
    botOpenIdProvider,
    fetchToken,
  } = input.channel;

  const channelStore = createChannelConfigStore(input.paths, input.runtimeId);
  const inboundRepo = createInboundEventRepo(input.paths, input.runtimeId);
  const outboundQueue = createChannelOutboundJobQueue(input.paths, input.runtimeId);
  const registry = createProviderRegistry();
  const userDir = createUserDirectory(input.paths, input.runtimeId);
  const guardianBoot = createGuardianThreadBootstrap({
    paths: input.paths,
    runtimeId: input.runtimeId,
    threadRepo: master.threadRepo,
  });

  async function rebuildProvider(provider: string): Promise<void> {
    const raw = await channelStore.loadRaw(provider);
    if (!raw || !raw.enabled) {
      if (registry.get(provider) !== null) {
        registry.remove(provider);
      }
      return;
    }
    if (provider === "feishu") {
      const config = parseFeishuConfig(raw);
      const secrets = await resolveFeishuSecrets(config, env);
      const botOpenId = botOpenIdProvider ? botOpenIdProvider() : "";
      if (registry.get(provider) !== null) {
        registry.remove(provider);
      }
      const feishuProvider = createFeishuProviderFromConfig({
        config,
        secrets,
        botOpenId,
        ...(fetchToken !== undefined && { fetchToken }),
      });
      registry.register(feishuProvider);
    }
  }

  const ingress = createIngressServer();

  mountAdminApi(ingress, {
    adminToken,
    channelStore,
    onChannelConfigChanged: rebuildProvider,
    threadRepo: master.threadRepo,
    taskRepo: master.taskRepo,
    planRepo: master.planRepo,
    transcript: master.transcript,
    paths: input.paths,
    runtimeId: input.runtimeId,
    ingest: async (req) => master.ingestInbound(req),
  });

  const lookup = createBindingLookup(input.paths, input.runtimeId, {
    resolveUserByExternalId: async (provider, externalUserId) =>
      userDir.resolveOrCreate(provider, externalUserId, externalUserId),
    createGuardianThread: async (_provider, userId, _type, _ext) =>
      guardianBoot.ensureGuardianThread(userId),
  });

  const webhook = createWebhookHandler({
    registry,
    inboundRepo,
    ingest: master.ingestInbound,
    lookupBinding: lookup,
    configResolver: async (p) => {
      const raw = await channelStore.loadRaw(p);
      return raw ? { secret: raw.secretRefs.appSecret ?? "" } : null;
    },
  });

  ingress.route("POST", "/webhooks/feishu", (req) =>
    webhook({ provider: "feishu", headers: req.headers, rawBody: req.rawBody }),
  );

  const { port } = await ingress.listen(configuredPort);

  const outboundRunner = createChannelOutboundRunner({ queue: outboundQueue, registry });

  return {
    master,
    worker,
    outboundRunner,
    providerRegistry: registry,
    ingressPort: port,
    channelStore,
    async close() {
      await ingress.close();
      await master.close();
      await worker.close();
      await release();
    },
  };
}
