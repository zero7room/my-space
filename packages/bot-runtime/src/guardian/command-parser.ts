export type GuardianCommand =
  | { kind: "bind"; threadId: string | null }
  | { kind: "unbind" }
  | { kind: "list" }
  | { kind: "help" }
  | { kind: "unknown" };

export function parseGuardianCommand(text: string): GuardianCommand {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed.startsWith("/")) return { kind: "unknown" };
  const [head, ...rest] = trimmed.slice(1).split(/\s+/);
  if (head === "bind") {
    return { kind: "bind", threadId: rest[0] ?? null };
  }
  if (head === "unbind") return { kind: "unbind" };
  if (head === "list") return { kind: "list" };
  if (head === "help") return { kind: "help" };
  return { kind: "unknown" };
}
