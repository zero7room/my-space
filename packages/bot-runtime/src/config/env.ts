import { z } from "zod";

const ConfigSchema = z.object({
  DATA_DIR: z.string().min(1, "DATA_DIR is required"),
  BOT_RUNTIME_ROLE: z.enum(["master", "worker", "hybrid"], {
    errorMap: () => ({ message: "role must be master|worker|hybrid" }),
  }),
  RUNTIME_ID: z.string().min(1).default("rt-default"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  ANTHROPIC_MAX_TOKENS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(2048),
  EXECUTOR_MAX_STEPS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(40),
  EXECUTOR_LEASE_MS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(60_000),
  DEDUPE_RETENTION_DAYS: z
    .preprocess((v) => (typeof v === "string" ? Number(v) : v), z.number().int().positive())
    .default(30),
});

export type RuntimeConfig = {
  dataDir: string;
  role: "master" | "worker" | "hybrid";
  runtimeId: string;
  anthropicApiKey?: string;
  anthropicModel: string;
  anthropicMaxTokens: number;
  executorMaxSteps: number;
  executorLeaseMs: number;
  dedupeRetentionDays: number;
};

export function parseRuntimeConfig(env: Record<string, unknown>): RuntimeConfig {
  const parsed = ConfigSchema.parse(env);
  const config: RuntimeConfig = {
    dataDir: parsed.DATA_DIR,
    role: parsed.BOT_RUNTIME_ROLE,
    runtimeId: parsed.RUNTIME_ID,
    anthropicModel: parsed.ANTHROPIC_MODEL,
    anthropicMaxTokens: parsed.ANTHROPIC_MAX_TOKENS,
    executorMaxSteps: parsed.EXECUTOR_MAX_STEPS,
    executorLeaseMs: parsed.EXECUTOR_LEASE_MS,
    dedupeRetentionDays: parsed.DEDUPE_RETENTION_DAYS,
  };
  if (parsed.ANTHROPIC_API_KEY !== undefined) {
    config.anthropicApiKey = parsed.ANTHROPIC_API_KEY;
  }
  return config;
}
