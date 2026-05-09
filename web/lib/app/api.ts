import { serverApiBaseUrl } from "@/lib/api/server-config";
import {
  alerts,
  artifacts,
  chatThreads,
  commandItems,
  events,
  graphEdges,
  graphNodes,
  leaderStocks,
  sectors,
  skills,
  stocks,
  strategies,
} from "@/lib/app/fixtures";
import type {
  SchemaAlertListResponse,
  SchemaAlertResponse,
  SchemaArtifactResponse,
  SchemaChartSpec,
  SchemaConclusion,
  SchemaHighlight,
  SchemaSectorLatestResponse,
  SchemaStrategyListResponse,
  SchemaStrategyResponse,
  SchemaSubjectRef,
  SchemaSymbolLatestResponse,
} from "@/lib/api/schema";
import type {
  AlertSummary,
  AlertState,
  Artifact,
  ArtifactChart,
  ArtifactConclusion,
  ChartKind,
  ChatThread,
  CommandItem,
  GraphEdge,
  GraphNode,
  LeaderStock,
  MarketEvent,
  SectorSummary,
  SkillCard,
  StockSummary,
  Strategy,
} from "@/lib/app/types";

export type AppApiSource = "api" | "fixture" | "fallback";

export type AppApiResult<T> = {
  data: T;
  source: AppApiSource;
  error?: string;
};

const isMockMode = () => process.env.NEXT_PUBLIC_API_MOCKING === "enabled";

function endpoint(path: string) {
  return new URL(path, serverApiBaseUrl).toString();
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(endpoint(path), {
    headers: {
      accept: "application/json",
    },
    next: { revalidate: 30 },
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

async function withFallback<T>(
  path: string,
  fixtureValue: () => T,
  options: { notFoundMessage?: string } = {},
): Promise<AppApiResult<T>> {
  if (isMockMode()) {
    return { data: fixtureValue(), source: "fixture" };
  }

  try {
    return { data: await getJson<T>(path), source: "api" };
  } catch (error) {
    return {
      data: fixtureValue(),
      source: "fallback",
      error: error instanceof Error ? error.message : options.notFoundMessage,
    };
  }
}

async function withMappedFallback<TRaw, TData>(
  path: string,
  fixtureValue: () => TData,
  mapData: (raw: TRaw) => TData,
  options: { notFoundMessage?: string } = {},
): Promise<AppApiResult<TData>> {
  if (isMockMode()) {
    return { data: fixtureValue(), source: "fixture" };
  }

  try {
    return { data: mapData(await getJson<TRaw>(path)), source: "api" };
  } catch (error) {
    return {
      data: fixtureValue(),
      source: "fallback",
      error: error instanceof Error ? error.message : options.notFoundMessage,
    };
  }
}

function missing<T>(label: string, id: string): AppApiResult<T | null> {
  return {
    data: null,
    source: isMockMode() ? "fixture" : "fallback",
    error: `${label} not found: ${id}`,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function formatDateTime(value?: string): string {
  if (!value) {
    return "";
  }

  return value.replace("T", " ").replace(/Z$/, "").slice(0, 16);
}

function formatClock(value?: string | null): string {
  const formatted = formatDateTime(value ?? undefined);
  return formatted.slice(11, 16) || formatted || "持续观察";
}

function formatFundFlow(flow: Record<string, unknown>): string {
  const inflow = asNumber(flow.net_inflow);
  const amount = Math.abs(inflow) / 100_000_000;
  const prefix = inflow >= 0 ? "+" : "-";

  return `${prefix}${amount.toFixed(2)} 亿`;
}

function formatCoverage(value: number): string {
  return `${Math.round(value * 100)}% 覆盖`;
}

function subjectName(subject?: SchemaSubjectRef): string {
  return subject?.name ?? subject?.id ?? "未知主体";
}

function stateForAlert(state: SchemaAlertResponse["state"]): AlertState {
  if (state === "active" || state === "sent" || state === "merged" || state === "deferred") {
    return state;
  }

  return "deferred";
}

function followUpText(value?: Record<string, unknown>): string {
  if (!value || Object.keys(value).length === 0) {
    return "继续观察后续走势。";
  }

  if (typeof value.window === "string") {
    return value.window;
  }

  const fields = Array.isArray(value.fields) ? value.fields.join(", ") : undefined;
  return fields ? `跟踪 ${fields}` : JSON.stringify(value);
}

function localSectorName(sectorId: string): string {
  return sectors.find((sector) => sector.id === sectorId)?.name ?? "光模块";
}

function breakdownToScores(raw: Record<string, unknown>): StockSummary["scoreBreakdown"] {
  const labels: Record<string, string> = {
    scale: "规模地位",
    growth: "成长质量",
    chain_position: "产业链位置",
    profitability: "盈利质量",
    attention: "市场关注度",
  };

  return Object.entries(labels).map(([key, dimension]) => ({
    dimension,
    score: Math.round(asNumber(raw[key]) * 100),
    weight: key === "chain_position" ? 20 : key === "profitability" || key === "attention" ? 15 : 25,
  }));
}

function chartKind(kind: string): ChartKind {
  if (kind === "radar" || kind === "line" || kind === "bar" || kind === "network") {
    return kind;
  }

  if (kind === "graph") {
    return "network";
  }

  return "bar";
}

function skillLabel(skill: string): string {
  const labels: Record<string, string> = {
    leader_identification: "龙头识别",
    long_term_value: "长期价值",
    market_overview: "市场总览",
    sector_center: "板块中枢",
    supply_chain_analysis: "产业链分析",
  };

  return labels[skill] ?? skill;
}

function mapChart(chart: SchemaChartSpec, index: number): ArtifactChart {
  return {
    id: `chart-${index}`,
    title: chart.title,
    kind: chartKind(chart.type),
  };
}

function mapConclusion(conclusion: SchemaConclusion, index: number): ArtifactConclusion {
  return {
    id: `conclusion-${index}`,
    relationClass: conclusion.relation_class,
    text: conclusion.claim,
    confidence: conclusion.confidence,
    evidence: conclusion.evidence ?? [],
  };
}

function mapHighlight(highlight: SchemaHighlight): string {
  return highlight.text;
}

function mapArtifact(raw: SchemaArtifactResponse): Artifact {
  const fixture = artifacts.find((item) => item.runId === raw.run_id);
  if (fixture) {
    return {
      ...fixture,
      asOf: formatDateTime(raw.created_at) || fixture.asOf,
      summary: raw.summary || fixture.summary,
      highlights: raw.highlights?.length ? raw.highlights.map(mapHighlight) : fixture.highlights,
      charts: raw.charts?.length ? raw.charts.map(mapChart) : fixture.charts,
      conclusions: raw.conclusions?.length ? raw.conclusions.map(mapConclusion) : fixture.conclusions,
    };
  }

  const subject = subjectName(raw.subject);
  const skill = skillLabel(raw.skill);

  return {
    runId: raw.run_id ?? raw.raw_pointer,
    title: `${subject} ${skill}`,
    skill,
    subject,
    asOf: formatDateTime(raw.created_at),
    summary: raw.summary,
    highlights: (raw.highlights ?? []).map(mapHighlight),
    charts: (raw.charts ?? []).map(mapChart),
    conclusions: (raw.conclusions ?? []).map(mapConclusion),
  };
}

function mapAlert(raw: SchemaAlertResponse): AlertSummary {
  return {
    id: raw.alert_id,
    title: raw.title,
    time: formatClock(raw.sent_at ?? raw.created_at),
    priority: raw.priority,
    state: stateForAlert(raw.state),
    subjectType: raw.subject.type as AlertSummary["subjectType"],
    subjectId: raw.subject.id,
    trigger: raw.rule_id,
    context: raw.summary,
    followUp: followUpText(raw.follow_up),
    evidence: raw.evidence,
    artifactRunId: raw.artifact_run_id ?? "run_cpo_leader_20260508",
    openChatThreadId: raw.open_chat_thread_id ?? undefined,
    strategyId: raw.rule_id,
  };
}

function mapSector(raw: SchemaSectorLatestResponse): SectorSummary {
  const firstLeader = asRecord(raw.leaders[0]);
  const firstMember = asRecord(raw.members[0]);
  const leaderCode = asString(firstLeader.symbol, asString(firstMember.symbol, raw.id));
  const leaderName = asString(firstLeader.name, asString(firstMember.name, raw.name));
  const heat = Math.round(asNumber(firstMember.heat, asNumber(raw.fund_flow.rank_percentile)) * 100);
  const change = asNumber(firstMember.return_pct);
  const tags = [heat >= 80 ? "高热度" : "观察", asNumber(raw.fund_flow.net_inflow) >= 0 ? "资金流入" : "资金流出"];

  return {
    id: raw.id,
    name: raw.name,
    change,
    heat,
    fundFlow: formatFundFlow(raw.fund_flow),
    leader: leaderName,
    leaderCode,
    asOf: formatDateTime(raw.as_of),
    coverage: formatCoverage(raw.metric_coverage),
    tags,
  };
}

function mapSymbol(raw: SchemaSymbolLatestResponse): StockSummary {
  const score = asNumber(raw.leader_score.composite);
  const value = raw.value;
  const riskTags = Array.isArray(value.governance_risk_tags)
    ? value.governance_risk_tags.map((tag) => String(tag))
    : [];
  const valuationPercentile = asNumber(value.valuation_percentile);
  const firstArtifact = raw.artifacts[0];
  const breakdown = asRecord(raw.leader_score.breakdown);

  return {
    code: raw.code,
    name: raw.name,
    sectorId: raw.sector_id,
    sectorName: localSectorName(raw.sector_id),
    price: 0,
    change: 0,
    longTermValue: valuationPercentile ? `估值分位 ${Math.round(valuationPercentile * 100)}%` : raw.summary,
    score,
    asOf: formatDateTime(firstArtifact?.created_at),
    scoreBreakdown: breakdownToScores(breakdown),
    reasons: [raw.summary, ...(firstArtifact?.highlights ?? []).map((highlight) => highlight.text)],
    risks: riskTags.length > 0 ? riskTags : ["持续跟踪估值与订单兑现"],
  };
}

function scheduleForDsl(dsl: Record<string, unknown>): string {
  const trigger = asRecord(dsl.trigger);
  return asString(trigger.cron, asString(trigger.type, "手动"));
}

function mapStrategy(raw: SchemaStrategyResponse): Strategy {
  const dsl = raw.dsl;
  const candidate = raw.last_candidate;
  const priority = asString(candidate?.priority, "watch");
  const delta = asNumber(asRecord(candidate?.ctx).delta);

  return {
    id: raw.id,
    name: raw.name,
    skill: asString(dsl.skill, "unknown"),
    schedule: scheduleForDsl(dsl),
    enabled: raw.enabled,
    status: candidate ? `最近候选: ${priority}` : "暂无命中",
    hitCountToday: candidate ? 1 : 0,
    hitCount7d: candidate ? 1 : 0,
    thresholdDistance: delta ? `delta ${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : undefined,
    recentArtifactRunId: asString(dsl.skill) === "leader_identification" ? "run_cpo_leader_20260508" : undefined,
    dsl: JSON.stringify(dsl, null, 2),
  };
}

export async function getAlerts(strategyId?: string): Promise<AppApiResult<AlertSummary[]>> {
  const path = strategyId ? `/api/v1/alerts?strategy_id=${encodeURIComponent(strategyId)}` : "/api/v1/alerts";

  return withMappedFallback<SchemaAlertListResponse, AlertSummary[]>(
    path,
    () => (strategyId ? alerts.filter((alert) => alert.strategyId === strategyId) : alerts),
    (payload) => {
      const mapped = payload.items.map(mapAlert);
      return strategyId ? mapped.filter((alert) => alert.strategyId === strategyId) : mapped;
    },
  );
}

export async function getSectorLatest(id: string): Promise<AppApiResult<SectorSummary | null>> {
  const fixture = sectors.find((sector) => sector.id === id);

  if (isMockMode() && !fixture) {
    return missing<SectorSummary>("Sector", id);
  }

  const result = await withMappedFallback<SchemaSectorLatestResponse, SectorSummary | null>(
    `/api/v1/sectors/${encodeURIComponent(id)}/latest`,
    () => fixture ?? null,
    mapSector,
  );

  if (!result.data) {
    return { ...result, error: `Sector not found: ${id}` };
  }

  return result;
}

export async function getSymbolLatest(code: string): Promise<AppApiResult<StockSummary | null>> {
  const fixture = stocks.find((stock) => stock.code === code);

  if (isMockMode() && !fixture) {
    return missing<StockSummary>("Symbol", code);
  }

  const result = await withMappedFallback<SchemaSymbolLatestResponse, StockSummary | null>(
    `/api/v1/symbols/${encodeURIComponent(code)}/latest`,
    () => fixture ?? null,
    mapSymbol,
  );

  if (!result.data) {
    return { ...result, error: `Symbol not found: ${code}` };
  }

  return result;
}

export async function getStrategies(): Promise<AppApiResult<Strategy[]>> {
  return withMappedFallback<SchemaStrategyListResponse, Strategy[]>(
    "/api/v1/strategies",
    () => strategies,
    (payload) => payload.items.map(mapStrategy),
  );
}

export async function getStrategy(id: string): Promise<AppApiResult<Strategy | null>> {
  const strategy = strategies.find((item) => item.id === id);

  if (isMockMode()) {
    return strategy ? { data: strategy, source: "fixture" } : missing<Strategy>("Strategy", id);
  }

  const result = await withMappedFallback<SchemaStrategyResponse, Strategy | null>(
    `/api/v1/strategies/${encodeURIComponent(id)}`,
    () => strategy ?? null,
    mapStrategy,
  );

  if (!result.data) {
    return { ...result, error: `Strategy not found: ${id}` };
  }

  return result;
}

export async function getArtifact(runId: string): Promise<AppApiResult<Artifact | null>> {
  const artifact = artifacts.find((item) => item.runId === runId);

  if (isMockMode()) {
    return artifact ? { data: artifact, source: "fixture" } : missing<Artifact>("Artifact", runId);
  }

  const result = await withMappedFallback<SchemaArtifactResponse, Artifact | null>(
    `/api/v1/artifacts/${encodeURIComponent(runId)}`,
    () => artifact ?? null,
    mapArtifact,
  );

  if (!result.data) {
    return { ...result, error: `Artifact not found: ${runId}` };
  }

  return result;
}

export async function getSkills(): Promise<AppApiResult<SkillCard[]>> {
  return withFallback("/api/v1/skills", () => skills);
}

export async function getMarketOverview(): Promise<
  AppApiResult<{ sectors: SectorSummary[]; events: MarketEvent[] }>
> {
  return { data: { sectors, events }, source: isMockMode() ? "fixture" : "fallback" };
}

export async function getCommandItems(): Promise<AppApiResult<CommandItem[]>> {
  return { data: commandItems, source: isMockMode() ? "fixture" : "fallback" };
}

export async function getThread(threadId?: string): Promise<AppApiResult<ChatThread | null>> {
  const thread = threadId
    ? chatThreads.find((item) => item.id === threadId)
    : chatThreads[0];

  return thread
    ? { data: thread, source: isMockMode() ? "fixture" : "fallback" }
    : missing<ChatThread>("Thread", threadId ?? "default");
}

export function getLocalThreads(): ChatThread[] {
  return chatThreads;
}

export function getLocalArtifacts(): Artifact[] {
  return artifacts;
}

export function getLocalLeaderStocks(): LeaderStock[] {
  return leaderStocks;
}

export function getLocalGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
  return { nodes: graphNodes, edges: graphEdges };
}

export function getLocalStocks(): StockSummary[] {
  return stocks;
}
