import {
  type ChannelBinding,
  type ChannelConfig,
  type ChannelInboundEvent,
  type ChannelJob,
  type ChatClaim,
  channelBindingSchema,
  channelConfigSchema,
  channelInboundEventSchema,
  channelJobSchema,
  chatClaimSchema,
} from '@ai-workflow/contracts';
import {
  InstancePaths,
  atomicWriteJson,
  atomicRename,
  ensureDir,
  exclusiveCreateJson,
  listJsonFilesSorted,
  listSubdirsSorted,
  readJson,
  removeIfExists,
} from '@ai-workflow/fs-store';

export class ChannelConfigRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(config: ChannelConfig): Promise<ChannelConfig> {
    const v = channelConfigSchema.parse(config);
    await atomicWriteJson(this.paths.channelConfigFile(v.provider), v);
    return v;
  }

  async get(provider: string): Promise<ChannelConfig | undefined> {
    const raw = await readJson(this.paths.channelConfigFile(provider));
    if (!raw) return undefined;
    return channelConfigSchema.parse(raw);
  }

  async list(): Promise<ChannelConfig[]> {
    const root = `${this.paths.stateRoot}/channels`;
    await ensureDir(root);
    const files = await listJsonFilesSorted(root);
    const out: ChannelConfig[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(channelConfigSchema.parse(raw));
    }
    return out;
  }
}

export class ChannelBindingRepository {
  constructor(private readonly paths: InstancePaths) {}

  async save(binding: ChannelBinding): Promise<ChannelBinding> {
    const v = channelBindingSchema.parse(binding);
    await ensureDir(
      this.paths.bindingDir(v.threadId, v.provider, v.id),
    );
    await atomicWriteJson(
      this.paths.bindingActiveFile(v.threadId, v.provider, v.id),
      v,
    );
    return v;
  }

  async get(
    threadId: string,
    provider: string,
    bindingId: string,
  ): Promise<ChannelBinding | undefined> {
    const raw = await readJson(
      this.paths.bindingActiveFile(threadId, provider, bindingId),
    );
    if (!raw) return undefined;
    return channelBindingSchema.parse(raw);
  }

  async listForThread(threadId: string): Promise<ChannelBinding[]> {
    const root = this.paths.bindingsRoot(threadId);
    await ensureDir(root);
    const providers = await listSubdirsSorted(root);
    const out: ChannelBinding[] = [];
    for (const p of providers) {
      const bindings = await listSubdirsSorted(`${root}/${p}`);
      for (const id of bindings) {
        const b = await this.get(threadId, p, id);
        if (b) out.push(b);
      }
    }
    return out;
  }

  /**
   * `chat-claims/<channelType>/<externalChatId>` is the uniqueness index.
   * Created with O_EXCL — second binding to the same external chat fails.
   */
  async claimExternalChat(claim: ChatClaim): Promise<ChatClaim> {
    const v = chatClaimSchema.parse(claim);
    await exclusiveCreateJson(
      this.paths.chatClaimFile(v.provider, v.externalConversationId),
      v,
    );
    return v;
  }

  async releaseExternalChat(provider: string, externalChatId: string): Promise<void> {
    await removeIfExists(this.paths.chatClaimFile(provider, externalChatId));
  }
}

export class ChannelEventRepository {
  constructor(private readonly paths: InstancePaths) {}

  async record(event: ChannelInboundEvent): Promise<ChannelInboundEvent> {
    const v = channelInboundEventSchema.parse(event);
    await atomicWriteJson(
      this.paths.webhookEventFile(v.provider, v.externalEventId),
      v,
    );
    return v;
  }

  async get(provider: string, externalEventId: string): Promise<ChannelInboundEvent | undefined> {
    const raw = await readJson(this.paths.webhookEventFile(provider, externalEventId));
    if (!raw) return undefined;
    return channelInboundEventSchema.parse(raw);
  }
}

export class ChannelJobRepository {
  constructor(private readonly paths: InstancePaths) {}

  async create(job: ChannelJob): Promise<ChannelJob> {
    const v = channelJobSchema.parse(job);
    await atomicWriteJson(this.paths.jobFile('pending', v.id), v);
    return v;
  }

  async get(
    bucket: 'pending' | 'locked' | 'done' | 'failed',
    jobId: string,
  ): Promise<ChannelJob | undefined> {
    const raw = await readJson(this.paths.jobFile(bucket, jobId));
    if (!raw) return undefined;
    return channelJobSchema.parse(raw);
  }

  /** Move a job between buckets via atomic rename. */
  async move(
    job: ChannelJob,
    from: 'pending' | 'locked' | 'done' | 'failed',
    to: 'pending' | 'locked' | 'done' | 'failed',
  ): Promise<void> {
    await atomicRename(
      this.paths.jobFile(from, job.id),
      this.paths.jobFile(to, job.id),
    );
  }

  async list(bucket: 'pending' | 'locked' | 'done' | 'failed'): Promise<ChannelJob[]> {
    const root = this.paths.jobsBucketRoot(bucket);
    await ensureDir(root);
    const files = await listJsonFilesSorted(root);
    const out: ChannelJob[] = [];
    for (const f of files) {
      const raw = await readJson(f);
      if (!raw) continue;
      out.push(channelJobSchema.parse(raw));
    }
    return out;
  }
}
