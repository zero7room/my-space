import {
  type Team,
  type Teammate,
  type TeamMessage,
  type TeamWorkItem,
  type EventEnvelope,
  teamSchema,
  teammateSchema,
  teamMessageSchema,
  teamWorkItemSchema,
  eventEnvelopeSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  appendEvent,
  appendJsonl,
  atomicRename,
  atomicWriteJson,
  ensureDir,
  listJsonFilesSorted,
  listSubdirsSorted,
  readJson,
  readJsonl,
} from '@ai-workflow/fs-store';

type WorkItemBucket =
  | 'available'
  | 'claimed'
  | 'completed'
  | 'failed'
  | 'cancelled';

export class TeamRepository {
  constructor(private readonly paths: InstancePaths) {}

  async saveTeam(team: Team): Promise<Team> {
    const v = teamSchema.parse(team);
    await ensureDir(this.paths.teamRoot(v.threadId, v.parentTaskId, v.id));
    await atomicWriteJson(
      this.paths.teamFile(v.threadId, v.parentTaskId, v.id),
      v,
    );
    return v;
  }

  async getTeam(
    threadId: string,
    taskId: string,
    teamId: string,
  ): Promise<Team | undefined> {
    const raw = await readJson(this.paths.teamFile(threadId, taskId, teamId));
    if (!raw) return undefined;
    return teamSchema.parse(raw);
  }

  async listTeamsForTask(threadId: string, taskId: string): Promise<Team[]> {
    const root = this.paths.taskTeamsRoot(threadId, taskId);
    const subs = await listSubdirsSorted(root);
    const out: Team[] = [];
    for (const id of subs) {
      const t = await this.getTeam(threadId, taskId, id);
      if (t) out.push(t);
    }
    return out;
  }

  async appendTeamEvent(
    threadId: string,
    taskId: string,
    teamId: string,
    event: Omit<EventEnvelope, 'id' | 'seq'>,
  ): Promise<EventEnvelope> {
    const log = this.paths.teamEventsLog(threadId, taskId, teamId);
    const out = await appendEvent(log, { ...event });
    return eventEnvelopeSchema.parse(out);
  }

  async readTeamEvents(
    threadId: string,
    taskId: string,
    teamId: string,
  ): Promise<EventEnvelope[]> {
    const log = this.paths.teamEventsLog(threadId, taskId, teamId);
    const lines = await readJsonl<EventEnvelope>(log);
    return lines.map((l) => eventEnvelopeSchema.parse(l));
  }

  async appendTeamMessage(
    threadId: string,
    taskId: string,
    msg: TeamMessage,
  ): Promise<TeamMessage> {
    const v = teamMessageSchema.parse(msg);
    const log = this.paths.teamMessagesLog(threadId, taskId, v.teamId);
    await appendJsonl(log, v);
    return v;
  }

  async readTeamMessages(
    threadId: string,
    taskId: string,
    teamId: string,
  ): Promise<TeamMessage[]> {
    const log = this.paths.teamMessagesLog(threadId, taskId, teamId);
    const lines = await readJsonl<TeamMessage>(log);
    return lines.map((l) => teamMessageSchema.parse(l));
  }

  async saveWorkItem(
    threadId: string,
    taskId: string,
    bucket: WorkItemBucket,
    item: TeamWorkItem,
  ): Promise<TeamWorkItem> {
    const v = teamWorkItemSchema.parse(item);
    await ensureDir(
      this.paths.teamWorkItemRoot(threadId, taskId, v.teamId, bucket),
    );
    await atomicWriteJson(
      this.paths.teamWorkItemFile(threadId, taskId, v.teamId, bucket, v.id),
      v,
    );
    return v;
  }

  /** Atomically move a work item between buckets via rename. */
  async moveWorkItem(
    threadId: string,
    taskId: string,
    teamId: string,
    workItemId: string,
    from: WorkItemBucket,
    to: WorkItemBucket,
  ): Promise<void> {
    await atomicRename(
      this.paths.teamWorkItemFile(threadId, taskId, teamId, from, workItemId),
      this.paths.teamWorkItemFile(threadId, taskId, teamId, to, workItemId),
    );
  }

  async listWorkItems(
    threadId: string,
    taskId: string,
    teamId: string,
    bucket: WorkItemBucket,
  ): Promise<TeamWorkItem[]> {
    const root = this.paths.teamWorkItemRoot(threadId, taskId, teamId, bucket);
    const files = await listJsonFilesSorted(root);
    const out: TeamWorkItem[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(teamWorkItemSchema.parse(raw));
    }
    return out;
  }

  async saveTeammate(
    threadId: string,
    taskId: string,
    teammate: Teammate,
  ): Promise<Teammate> {
    const v = teammateSchema.parse(teammate);
    await ensureDir(
      this.paths.teammateRoot(threadId, taskId, v.teamId, v.id),
    );
    await atomicWriteJson(
      this.paths.teammateFile(threadId, taskId, v.teamId, v.id),
      v,
    );
    return v;
  }

  async getTeammate(
    threadId: string,
    taskId: string,
    teamId: string,
    teammateId: string,
  ): Promise<Teammate | undefined> {
    const raw = await readJson(
      this.paths.teammateFile(threadId, taskId, teamId, teammateId),
    );
    if (!raw) return undefined;
    return teammateSchema.parse(raw);
  }

  async listTeammates(
    threadId: string,
    taskId: string,
    teamId: string,
  ): Promise<Teammate[]> {
    const root = this.paths.teammatesRoot(threadId, taskId, teamId);
    const subs = await listSubdirsSorted(root);
    const out: Teammate[] = [];
    for (const id of subs) {
      const t = await this.getTeammate(threadId, taskId, teamId, id);
      if (t) out.push(t);
    }
    return out;
  }
}
