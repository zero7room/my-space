import type { ChannelBinding } from "../schema/channel.js";

export type NotifyTarget = "all" | { provider: string } | { bindingId: string };

export function resolveNotifyTargets(
  target: NotifyTarget,
  bindings: ChannelBinding[],
): ChannelBinding[] {
  if (target === "all") {
    return bindings.filter((b) => b.enabled && b.notifyDefault && b.status === "bound");
  }
  if ("bindingId" in target) {
    return bindings.filter((b) => b.id === target.bindingId);
  }
  return bindings.filter(
    (b) => b.provider === target.provider && b.enabled && b.status === "bound",
  );
}
