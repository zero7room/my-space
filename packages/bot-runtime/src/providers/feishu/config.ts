import { z } from "zod";
import type { ChannelConfig } from "../../schema/channel.js";

export type FeishuConfig = {
  appId: string;
  verificationToken: string;
  encryptKey: string;
  webhookEnabled: boolean;
  longConnectionEnabled: boolean;
  appSecretRef: string;
};

const PublicFieldsSchema = z.object({
  appId: z.string().min(1),
  verificationToken: z.string().min(1),
  encryptKey: z.string().default(""),
});

export function parseFeishuConfig(cfg: ChannelConfig): FeishuConfig {
  const pub = PublicFieldsSchema.parse(cfg.publicFields);
  return {
    appId: pub.appId,
    verificationToken: pub.verificationToken,
    encryptKey: pub.encryptKey ?? "",
    webhookEnabled: cfg.ingress.webhookEnabled ?? false,
    longConnectionEnabled: cfg.ingress.longConnectionEnabled ?? false,
    appSecretRef: cfg.secretRefs.appSecret ?? "",
  };
}

export type FeishuSecrets = {
  appSecret: string;
};

const REF_PREFIX = "ref::";

export async function resolveFeishuSecrets(
  cfg: Pick<FeishuConfig, "appSecretRef">,
  env: Record<string, string | undefined>,
): Promise<FeishuSecrets> {
  if (!cfg.appSecretRef.startsWith(REF_PREFIX)) {
    throw new Error("appSecretRef must start with ref::");
  }
  const envName = cfg.appSecretRef.slice(REF_PREFIX.length);
  const value = env[envName];
  if (!value) throw new Error(`env ${envName} not set`);
  return { appSecret: value };
}
