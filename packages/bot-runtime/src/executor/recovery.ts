import { type ExecutorEvent, ExecutorEventSchema } from "../schema/events.js";
import { readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";

export type InFlightToolCall = {
  toolName: string;
  argsRef: string;
  at: string;
};

export async function detectInFlightToolCall(
  paths: Paths,
  runtimeId: string,
  threadId: string,
  taskId: string,
): Promise<InFlightToolCall | null> {
  const events = (await readJsonl<unknown>(paths.taskEvents(runtimeId, threadId, taskId))).map(
    (e) => ExecutorEventSchema.parse(e),
  );
  let lastCall: ExecutorEvent | null = null;
  for (const e of events) {
    if (e.kind === "tool_call") lastCall = e;
    else if (e.kind === "tool_result" && lastCall && lastCall.kind === "tool_call") {
      if (e.toolName === lastCall.toolName) lastCall = null;
    }
  }
  if (!lastCall || lastCall.kind !== "tool_call") return null;
  return {
    toolName: lastCall.toolName,
    argsRef: lastCall.argsRef,
    at: lastCall.at,
  };
}
