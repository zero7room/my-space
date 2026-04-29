import type { ChannelConfigStore } from "../channel/config-store.js";
import type { IngressServer } from "../ingress/http-server.js";
import type { IngestFn } from "../ingress/webhook-handler.js";
import type { PlanRepo } from "../repositories/plan-repo.js";
import type { TaskRepo } from "../repositories/task-repo.js";
import type { ThreadRepo } from "../repositories/thread-repo.js";
import type { TranscriptRepo } from "../repositories/transcript-repo.js";
import type { Paths } from "../storage/paths.js";
import { mountActionApi } from "./action-api.js";
import { mountArtifactApi } from "./artifact-api.js";
import { mountChannelConfigApi } from "./channel-config-api.js";
import { mountEventsApi } from "./events-api.js";
import { mountPlanApi } from "./plan-api.js";
import { mountTaskApi } from "./task-api.js";
import { mountThreadApi } from "./thread-api.js";
import type { ThreadEventBroadcaster } from "./thread-event-broadcaster.js";
import { mountTranscriptApi } from "./transcript-api.js";

export type AdminApiOptions = {
  adminToken: string;
  channelStore: ChannelConfigStore;
  onChannelConfigChanged?: (provider: string) => void | Promise<void>;
  threadRepo?: ThreadRepo;
  taskRepo?: TaskRepo;
  planRepo?: PlanRepo;
  transcript?: TranscriptRepo;
  paths?: Paths;
  runtimeId?: string;
  ingest?: IngestFn;
  broadcaster?: ThreadEventBroadcaster;
};

export function mountAdminApi(server: IngressServer, opts: AdminApiOptions): void {
  mountChannelConfigApi(server, {
    store: opts.channelStore,
    adminToken: opts.adminToken,
    ...(opts.onChannelConfigChanged !== undefined && {
      onConfigChanged: opts.onChannelConfigChanged,
    }),
  });
  if (opts.threadRepo) {
    mountThreadApi(server, {
      threadRepo: opts.threadRepo,
      adminToken: opts.adminToken,
      ...(opts.paths !== undefined && { paths: opts.paths }),
      ...(opts.runtimeId !== undefined && { runtimeId: opts.runtimeId }),
    });
  }
  if (opts.taskRepo) mountTaskApi(server, { taskRepo: opts.taskRepo, adminToken: opts.adminToken });
  if (opts.planRepo) mountPlanApi(server, { planRepo: opts.planRepo, adminToken: opts.adminToken });
  if (opts.transcript)
    mountTranscriptApi(server, { transcript: opts.transcript, adminToken: opts.adminToken });
  if (opts.paths && opts.runtimeId) {
    mountArtifactApi(server, {
      paths: opts.paths,
      runtimeId: opts.runtimeId,
      adminToken: opts.adminToken,
    });
  }
  if (opts.ingest) mountActionApi(server, { ingest: opts.ingest, adminToken: opts.adminToken });
  if (opts.broadcaster) {
    mountEventsApi(server, { broadcaster: opts.broadcaster, adminToken: opts.adminToken });
  }
}
