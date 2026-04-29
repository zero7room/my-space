import { appendJsonl, readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import { sanitize } from "../storage/sanitize.js";

export type TranscriptEntry =
  | { kind: "user_message"; messageId: string; text: string; at: string }
  | { kind: "assistant_message"; messageId: string; text: string; at: string }
  | { kind: "tool_call"; toolName: string; argsRef: string; at: string }
  | { kind: "tool_result"; toolName: string; resultRef: string; at: string }
  | { kind: "guard_decision"; decisionId: string; intent: string; at: string }
  | { kind: "task_event"; taskId: string; eventKind: string; at: string }
  | { kind: "plan_event"; planId: string; eventKind: string; at: string };

export type TranscriptRepo = {
  append(threadId: string, entry: TranscriptEntry): Promise<void>;
  read(threadId: string): Promise<TranscriptEntry[]>;
};

export function createTranscriptRepo(
  paths: Paths,
  runtimeId: string,
): TranscriptRepo {
  return {
    append(threadId, entry) {
      return appendJsonl(paths.transcript(runtimeId, threadId), sanitize(entry));
    },
    read(threadId) {
      return readJsonl<TranscriptEntry>(paths.transcript(runtimeId, threadId));
    },
  };
}
