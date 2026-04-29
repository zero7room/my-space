// packages/bot-runtime/src/channel/provider-registry.ts
import type { ChannelProvider } from "./provider.js";

export type ProviderRegistry = {
  register(p: ChannelProvider): void;
  get(name: string): ChannelProvider | null;
  list(): string[];
};

export function createProviderRegistry(): ProviderRegistry {
  const map = new Map<string, ChannelProvider>();
  return {
    register(p) {
      if (map.has(p.provider)) {
        throw new Error(`provider ${p.provider} already registered`);
      }
      map.set(p.provider, p);
    },
    get(name) {
      return map.get(name) ?? null;
    },
    list() {
      return [...map.keys()];
    },
  };
}
