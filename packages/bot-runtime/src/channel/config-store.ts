import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import {
  type ChannelConfig,
  ChannelConfigSchema,
  type Provider,
  ProviderSchema,
} from "../schema/channel.js";
import { readJson, writeJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export type SanitizedChannelConfig = {
  provider: ChannelConfig["provider"];
  enabled: boolean;
  ingress: ChannelConfig["ingress"];
  publicFields: ChannelConfig["publicFields"];
  secrets: Record<string, { hasSecret: boolean }>;
  createdAt: string;
  updatedAt: string;
};

export type UpsertChannelConfigInput = {
  enabled: boolean;
  ingress: ChannelConfig["ingress"];
  publicFields: ChannelConfig["publicFields"];
  secretRefs: ChannelConfig["secretRefs"];
};

export type ChannelConfigStore = {
  upsert(provider: string, input: UpsertChannelConfigInput): Promise<ChannelConfig>;
  loadRaw(provider: Provider): Promise<ChannelConfig | null>;
  loadSanitized(provider: Provider): Promise<SanitizedChannelConfig | null>;
  list(): Promise<SanitizedChannelConfig[]>;
};

function sanitize(cfg: ChannelConfig): SanitizedChannelConfig {
  const secrets: Record<string, { hasSecret: boolean }> = {};
  for (const [k, v] of Object.entries(cfg.secretRefs)) {
    secrets[k] = { hasSecret: Boolean(v) };
  }
  return {
    provider: cfg.provider,
    enabled: cfg.enabled,
    ingress: cfg.ingress,
    publicFields: cfg.publicFields,
    secrets,
    createdAt: cfg.createdAt,
    updatedAt: cfg.updatedAt,
  };
}

export function createChannelConfigStore(paths: Paths, runtimeId: string): ChannelConfigStore {
  return {
    async upsert(provider, input) {
      const parsedProvider = ProviderSchema.parse(provider);
      const now = new Date().toISOString();
      const existing = await readJson(paths.channelConfig(runtimeId, parsedProvider));
      const createdAt =
        existing && typeof (existing as { createdAt?: unknown }).createdAt === "string"
          ? (existing as { createdAt: string }).createdAt
          : now;
      const cfg = ChannelConfigSchema.parse({
        provider: parsedProvider,
        enabled: input.enabled,
        ingress: input.ingress,
        publicFields: input.publicFields,
        secretRefs: input.secretRefs,
        createdAt,
        updatedAt: now,
      });
      await writeJson(paths.channelConfig(runtimeId, parsedProvider), cfg);
      return cfg;
    },
    async loadRaw(provider) {
      const got = await readJson(paths.channelConfig(runtimeId, provider));
      return got ? ChannelConfigSchema.parse(got) : null;
    },
    async loadSanitized(provider) {
      const raw = await this.loadRaw(provider);
      return raw ? sanitize(raw) : null;
    },
    async list() {
      const dir = path.posix.join(paths.state(runtimeId), "channels");
      await mkdir(dir, { recursive: true });
      const files = await readdir(dir);
      const out: SanitizedChannelConfig[] = [];
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const parsed = ProviderSchema.safeParse(f.replace(/\.json$/, ""));
        if (!parsed.success) continue;
        const got = await this.loadSanitized(parsed.data);
        if (got) out.push(got);
      }
      return out;
    },
  };
}
