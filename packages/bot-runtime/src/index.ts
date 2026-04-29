import { createPaths } from "./storage/paths.js";
import { createAnthropicLlmClient } from "./llm/anthropic.js";
import { parseRuntimeConfig } from "./config/env.js";
import { createMasterHost } from "./runtime/master-host.js";
import { createWorkerHost } from "./runtime/worker-host.js";
import { createHybridHost } from "./runtime/hybrid-host.js";

export const VERSION = "0.0.0";

export {
  createPaths,
  parseRuntimeConfig,
  createAnthropicLlmClient,
  createMasterHost,
  createWorkerHost,
  createHybridHost,
};

export async function main(env: Record<string, unknown> = process.env): Promise<void> {
  const cfg = parseRuntimeConfig(env);
  const paths = createPaths(cfg.dataDir);
  const llm = cfg.anthropicApiKey
    ? createAnthropicLlmClient({
        apiKey: cfg.anthropicApiKey,
        model: cfg.anthropicModel,
        maxTokens: cfg.anthropicMaxTokens,
      })
    : (() => {
        throw new Error("ANTHROPIC_API_KEY required for production run; use stub LLM in tests");
      })();

  if (cfg.role === "hybrid") {
    const host = await createHybridHost({
      paths,
      runtimeId: cfg.runtimeId,
      guardLlm: llm,
      draftLlm: llm,
      execLlm: llm,
      systemPrompt: "You are an AI employee.",
      maxSteps: cfg.executorMaxSteps,
      leaseMs: cfg.executorLeaseMs,
    });
    process.on("SIGINT", () => host.close().finally(() => process.exit(0)));
    process.on("SIGTERM", () => host.close().finally(() => process.exit(0)));
  } else if (cfg.role === "master") {
    await createMasterHost({
      paths,
      runtimeId: cfg.runtimeId,
      guardLlm: llm,
      draftLlm: llm,
      systemPrompt: "You are an AI employee.",
    });
  } else {
    await createWorkerHost({
      paths,
      runtimeId: cfg.runtimeId,
      llm,
      systemPrompt: "You are an AI employee.",
      maxSteps: cfg.executorMaxSteps,
      leaseMs: cfg.executorLeaseMs,
    });
  }
}
