/**
 * Composes `InstancePaths` + repositories into a single bag passed by ThreadLoop / API / Executor.
 */
import { InstancePaths } from '@ai-workflow/fs-store';

import {
  ArtifactRepository,
  ChangeRecordRepository,
  ChannelBindingRepository,
  ChannelConfigRepository,
  ChannelEventRepository,
  ChannelJobRepository,
  CriticalNodePolicyRepository,
  PlanRepository,
  PlanRevisionRepository,
  RuntimeInfoRepository,
  TaskListRepository,
  TaskRepository,
  TeamRepository,
  ThreadRepository,
  UserRepository,
} from './repositories/index.js';

export interface RuntimePathsConfig {
  workspaceRoot: string;
  runtimeId: string;
}

export class RuntimePaths {
  readonly paths: InstancePaths;
  readonly users: UserRepository;
  readonly threads: ThreadRepository;
  readonly tasks: TaskRepository;
  readonly taskLists: TaskListRepository;
  readonly plans: PlanRepository;
  readonly planRevisions: PlanRevisionRepository;
  readonly artifacts: ArtifactRepository;
  readonly changeRecords: ChangeRecordRepository;
  readonly channelConfigs: ChannelConfigRepository;
  readonly channelBindings: ChannelBindingRepository;
  readonly channelEvents: ChannelEventRepository;
  readonly channelJobs: ChannelJobRepository;
  readonly policies: CriticalNodePolicyRepository;
  readonly runtimeInfo: RuntimeInfoRepository;
  readonly teams: TeamRepository;

  constructor(cfg: RuntimePathsConfig) {
    this.paths = new InstancePaths(cfg);
    this.users = new UserRepository(this.paths);
    this.threads = new ThreadRepository(this.paths);
    this.tasks = new TaskRepository(this.paths);
    this.taskLists = new TaskListRepository(this.paths);
    this.plans = new PlanRepository(this.paths);
    this.planRevisions = new PlanRevisionRepository(this.paths);
    this.artifacts = new ArtifactRepository(this.paths);
    this.changeRecords = new ChangeRecordRepository(this.paths);
    this.channelConfigs = new ChannelConfigRepository(this.paths);
    this.channelBindings = new ChannelBindingRepository(this.paths);
    this.channelEvents = new ChannelEventRepository(this.paths);
    this.channelJobs = new ChannelJobRepository(this.paths);
    this.policies = new CriticalNodePolicyRepository(this.paths);
    this.runtimeInfo = new RuntimeInfoRepository(this.paths);
    this.teams = new TeamRepository(this.paths);
  }
}
