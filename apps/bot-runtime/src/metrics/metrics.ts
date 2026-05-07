/**
 * Prometheus metrics registry. Thin wrapper around prom-client so the rest of
 * the app can import typed counters/histograms without worrying about
 * singleton setup.
 */
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export class RuntimeMetrics {
  readonly registry = new Registry();
  readonly taskStarted: Counter<string>;
  readonly taskCompleted: Counter<string>;
  readonly taskFailed: Counter<string>;
  readonly retryScheduled: Counter<string>;
  readonly toolCallsTotal: Counter<string>;
  readonly toolCallDurationMs: Histogram<string>;
  readonly channelOutboundTotal: Counter<string>;
  readonly sanitizationsTotal: Counter<string>;
  readonly teamStarted: Counter<string>;
  readonly teamCompleted: Counter<string>;
  readonly teammateActiveCount: Gauge<string>;
  readonly workItemsTotal: Counter<string>;
  readonly workItemsAvailable: Gauge<string>;
  readonly sseAckMissing: Counter<string>;
  readonly sseReplayEmitted: Counter<string>;
  readonly artifactConsistencyWarning: Counter<string>;
  readonly notifyThrottled: Counter<string>;
  readonly eventsJsonlRotated: Counter<string>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });
    this.taskStarted = new Counter({
      name: 'ai_task_started_total',
      help: 'Number of tasks transitioned to running',
      registers: [this.registry],
    });
    this.taskCompleted = new Counter({
      name: 'ai_task_completed_total',
      help: 'Number of tasks transitioned to completed',
      registers: [this.registry],
    });
    this.taskFailed = new Counter({
      name: 'ai_task_failed_total',
      help: 'Number of tasks transitioned to failed',
      labelNames: ['failure_class'],
      registers: [this.registry],
    });
    this.retryScheduled = new Counter({
      name: 'ai_retry_scheduled_total',
      help: 'Retries scheduled (transient_error)',
      registers: [this.registry],
    });
    this.toolCallsTotal = new Counter({
      name: 'ai_tool_calls_total',
      help: 'Tool dispatches',
      labelNames: ['tool', 'outcome'],
      registers: [this.registry],
    });
    this.toolCallDurationMs = new Histogram({
      name: 'ai_tool_call_duration_ms',
      help: 'Tool dispatch duration',
      labelNames: ['tool'],
      buckets: [1, 10, 50, 100, 500, 1000, 5000, 30_000],
      registers: [this.registry],
    });
    this.channelOutboundTotal = new Counter({
      name: 'ai_channel_outbound_total',
      help: 'Outbound messages by provider and status',
      labelNames: ['provider', 'status'],
      registers: [this.registry],
    });
    this.sanitizationsTotal = new Counter({
      name: 'ai_sanitizations_total',
      help: 'Count of sanitizer-applied writes by kind',
      labelNames: ['kind'],
      registers: [this.registry],
    });
    this.teamStarted = new Counter({
      name: 'ai_team_started_total',
      help: 'Teams that transitioned to active',
      registers: [this.registry],
    });
    this.teamCompleted = new Counter({
      name: 'ai_team_completed_total',
      help: 'Teams that transitioned to completed',
      labelNames: ['outcome'],
      registers: [this.registry],
    });
    this.teammateActiveCount = new Gauge({
      name: 'ai_teammate_active_count',
      help: 'Teammates currently idle or working',
      labelNames: ['team_status'],
      registers: [this.registry],
    });
    this.workItemsTotal = new Counter({
      name: 'ai_work_items_total',
      help: 'Work items by bucket (created/claimed/completed/failed)',
      labelNames: ['bucket'],
      registers: [this.registry],
    });
    this.workItemsAvailable = new Gauge({
      name: 'ai_work_items_available_count',
      help: 'Work items in available/ right now',
      registers: [this.registry],
    });
    this.sseAckMissing = new Counter({
      name: 'ai_sse_ack_missing_total',
      help: 'SSE subscribers that exceeded the ack timeout',
      registers: [this.registry],
    });
    this.sseReplayEmitted = new Counter({
      name: 'ai_sse_replay_emitted_total',
      help: 'SSE replay envelopes synthesized',
      labelNames: ['reason'],
      registers: [this.registry],
    });
    this.artifactConsistencyWarning = new Counter({
      name: 'ai_artifact_consistency_warning_total',
      help: 'Artifact sha256 mismatch or missing warnings emitted',
      labelNames: ['kind'],
      registers: [this.registry],
    });
    this.notifyThrottled = new Counter({
      name: 'ai_notify_throttled_total',
      help: 'Outbound notify suppressed by throttle',
      labelNames: ['provider', 'reason'],
      registers: [this.registry],
    });
    this.eventsJsonlRotated = new Counter({
      name: 'ai_events_jsonl_rotated_total',
      help: 'events.jsonl files rotated at size/age threshold',
      registers: [this.registry],
    });
  }

  async scrape(): Promise<string> {
    return this.registry.metrics();
  }
}
