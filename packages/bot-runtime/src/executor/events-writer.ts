import { type ExecutorEvent, ExecutorEventSchema } from "../schema/events.js";
import { appendJsonl, readJsonl } from "../storage/jsonl.js";
import type { Paths } from "../storage/paths.js";
import { sanitize } from "../storage/sanitize.js";

export type EventsWriter = {
  write(event: ExecutorEvent): Promise<void>;
  readAll(): Promise<ExecutorEvent[]>;
};

export function createEventsWriter(
  paths: Paths,
  runtimeId: string,
  threadId: string,
  taskId: string,
): EventsWriter {
  const file = paths.taskEvents(runtimeId, threadId, taskId);
  return {
    async write(event) {
      const validated = ExecutorEventSchema.parse(event);
      await appendJsonl(file, sanitize(validated));
    },
    async readAll() {
      const raw = await readJsonl<unknown>(file);
      return raw.map((r) => ExecutorEventSchema.parse(r));
    },
  };
}
