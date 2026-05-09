export type Priority = "high" | "medium" | "low";

export type SubjectType = "market" | "sector" | "stock" | "event";

export type AlertState = "new" | "read" | "archived" | "active" | "sent" | "merged" | "deferred";

export type ChartKind = "radar" | "line" | "bar" | "network";

export type RelationClass = "fact" | "statistical" | "inferred";

export type AlertSummary = {
  id: string;
  title: string;
  time: string;
  priority: Priority;
  state: AlertState;
  subjectType: SubjectType;
  subjectId: string;
  trigger: string;
  context: string;
  followUp: string;
  evidence: string[];
  artifactRunId: string;
  openChatThreadId?: string;
  strategyId?: string;
};

export type SectorSummary = {
  id: string;
  name: string;
  change: number;
  heat: number;
  fundFlow: string;
  leader: string;
  leaderCode: string;
  asOf: string;
  coverage: string;
  tags: string[];
};

export type ScoreBreakdown = {
  dimension: string;
  score: number;
  weight: number;
};

export type LeaderStock = {
  code: string;
  name: string;
  score: number;
  change: number;
  reason: string;
  risks: string[];
  scoreBreakdown: ScoreBreakdown[];
};

export type StockSummary = {
  code: string;
  name: string;
  sectorId: string;
  sectorName: string;
  price: number;
  change: number;
  longTermValue: string;
  score: number;
  asOf: string;
  scoreBreakdown: ScoreBreakdown[];
  reasons: string[];
  risks: string[];
};

export type GraphNode = {
  id: string;
  label: string;
  type: "company" | "sector" | "product" | "raw" | "customer" | "event";
  evidence?: string[];
};

export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label: string;
  strength: number;
  confidence: number;
  stale?: boolean;
  evidence?: string[];
};

export type MarketEvent = {
  id: string;
  title: string;
  source: string;
  time: string;
  summary: string;
  affectedSectors: string[];
  paths: Array<{
    from: string;
    through: string;
    to: string;
    impact: "positive" | "negative" | "watch";
    confidence: number;
  }>;
};

export type ArtifactChart = {
  id: string;
  title: string;
  kind: ChartKind;
};

export type ArtifactConclusion = {
  id: string;
  relationClass: RelationClass;
  text: string;
  confidence: number;
  evidence: string[];
};

export type Artifact = {
  runId: string;
  title: string;
  skill: string;
  subject: string;
  asOf: string;
  summary: string;
  highlights: string[];
  charts: ArtifactChart[];
  conclusions: ArtifactConclusion[];
  graph?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
  };
};

export type ChatMessage = {
  id: string;
  role: "system" | "user" | "assistant";
  time: string;
  content: string;
  artifactRunId?: string;
  trace?: string[];
  tokenUsage?: number;
};

export type ChatThread = {
  id: string;
  title: string;
  pinned: boolean;
  tags: string[];
  updatedAt: string;
  subject?: string;
  messages: ChatMessage[];
};

export type Strategy = {
  id: string;
  name: string;
  skill: string;
  schedule: string;
  enabled: boolean;
  status: string;
  hitCountToday: number;
  hitCount7d: number;
  thresholdDistance?: string;
  recentArtifactRunId?: string;
  dsl: string;
};

export type SkillCard = {
  id: string;
  name: string;
  description: string;
  schema: string;
  enabled: boolean;
  strategyRefs: number;
  lastRun: string;
};

export type CommandItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  group: "Subject" | "Artifact" | "Action";
};
