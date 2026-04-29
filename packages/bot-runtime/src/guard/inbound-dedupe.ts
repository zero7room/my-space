import { writeJson, readJson } from "../storage/json-file.js";
import type { Paths } from "../storage/paths.js";

export async function isDuplicateInboundEvent(
  paths: Paths,
  runtimeId: string,
  provider: string,
  externalEventId: string,
): Promise<boolean> {
  const file = paths.webhookEvent(runtimeId, provider, externalEventId);
  const got = await readJson(file);
  return got !== null;
}

export async function recordInboundEvent(
  paths: Paths,
  runtimeId: string,
  provider: string,
  externalEventId: string,
  payload: unknown,
): Promise<void> {
  const file = paths.webhookEvent(runtimeId, provider, externalEventId);
  await writeJson(file, {
    externalEventId,
    provider,
    receivedAt: new Date().toISOString(),
    payload,
  });
}
