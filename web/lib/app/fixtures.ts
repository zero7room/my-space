import type {
  AlertSummary,
  Artifact,
  ChatThread,
  CommandItem,
  GraphEdge,
  GraphNode,
  MarketEvent,
  SectorSummary,
  SkillCard,
  StockSummary,
  Strategy,
} from "@/lib/app/types";

export const scoreDimensions = ["规模地位", "成长质量", "产业链位置", "盈利质量", "市场关注度"];

export const sectors: SectorSummary[] = [
  {
    id: "BK_CPO",
    name: "光模块",
    change: 2.18,
    heat: 91,
    fundFlow: "+18.4 亿",
    leader: "中际旭创",
    leaderCode: "300308",
    asOf: "2026-05-08 15:10",
    coverage: "5/5 维度",
    tags: ["科技", "海外映射", "高景气"],
  },
  {
    id: "BK_SERVER",
    name: "AI 服务器",
    change: 1.42,
    heat: 84,
    fundFlow: "+9.7 亿",
    leader: "工业富联",
    leaderCode: "601138",
    asOf: "2026-05-08 15:10",
    coverage: "4/5 维度",
    tags: ["科技", "算力链"],
  },
  {
    id: "BK_PCB",
    name: "高速 PCB",
    change: 0.86,
    heat: 78,
    fundFlow: "+4.2 亿",
    leader: "沪电股份",
    leaderCode: "002463",
    asOf: "2026-05-08 15:10",
    coverage: "4/5 维度",
    tags: ["科技", "供应链"],
  },
  {
    id: "BK_INNOVATIVE_DRUG",
    name: "创新药",
    change: -0.32,
    heat: 66,
    fundFlow: "-1.8 亿",
    leader: "恒瑞医药",
    leaderCode: "600276",
    asOf: "2026-05-08 15:10",
    coverage: "5/5 维度",
    tags: ["消费医疗", "政策"],
  },
  {
    id: "BK_DEFENSE",
    name: "军工电子",
    change: -0.48,
    heat: 61,
    fundFlow: "-2.6 亿",
    leader: "中航光电",
    leaderCode: "002179",
    asOf: "2026-05-08 15:10",
    coverage: "4/5 维度",
    tags: ["军工", "订单"],
  },
];

export const leaderStocks = [
  {
    code: "300308",
    name: "中际旭创",
    score: 0.86,
    change: 0.04,
    reason: "海外云厂商 800G 订单延续，成交额分位与盈利质量同时抬升。",
    risks: ["海外 capex 波动", "汇率扰动"],
    scoreBreakdown: [
      { dimension: "规模地位", score: 88, weight: 25 },
      { dimension: "成长质量", score: 92, weight: 25 },
      { dimension: "产业链位置", score: 90, weight: 20 },
      { dimension: "盈利质量", score: 82, weight: 15 },
      { dimension: "市场关注度", score: 78, weight: 15 },
    ],
  },
  {
    code: "300502",
    name: "新易盛",
    score: 0.81,
    change: 0.02,
    reason: "高速光模块出货验证，市场关注度继续维持高位。",
    risks: ["估值分位偏高", "客户集中度"],
    scoreBreakdown: [
      { dimension: "规模地位", score: 75, weight: 25 },
      { dimension: "成长质量", score: 90, weight: 25 },
      { dimension: "产业链位置", score: 84, weight: 20 },
      { dimension: "盈利质量", score: 78, weight: 15 },
      { dimension: "市场关注度", score: 82, weight: 15 },
    ],
  },
  {
    code: "300394",
    name: "天孚通信",
    score: 0.78,
    change: -0.01,
    reason: "器件环节壁垒稳定，但资金强度弱于前两名。",
    risks: ["产品价格下行", "订单节奏后移"],
    scoreBreakdown: [
      { dimension: "规模地位", score: 68, weight: 25 },
      { dimension: "成长质量", score: 82, weight: 25 },
      { dimension: "产业链位置", score: 88, weight: 20 },
      { dimension: "盈利质量", score: 81, weight: 15 },
      { dimension: "市场关注度", score: 74, weight: 15 },
    ],
  },
];

export const stocks: StockSummary[] = [
  {
    code: "300308",
    name: "中际旭创",
    sectorId: "BK_CPO",
    sectorName: "光模块",
    price: 158.32,
    change: 3.12,
    longTermValue: "高景气但估值敏感",
    score: 0.86,
    asOf: "2026-05-08 15:10",
    scoreBreakdown: leaderStocks[0].scoreBreakdown,
    reasons: ["龙头评分升至 0.86", "800G 订单证据链增强", "资金关注度高于 20 日均值"],
    risks: leaderStocks[0].risks,
  },
  {
    code: "601138",
    name: "工业富联",
    sectorId: "BK_SERVER",
    sectorName: "AI 服务器",
    price: 23.88,
    change: 1.91,
    longTermValue: "订单兑现跟踪",
    score: 0.79,
    asOf: "2026-05-08 15:10",
    scoreBreakdown: [
      { dimension: "规模地位", score: 91, weight: 25 },
      { dimension: "成长质量", score: 74, weight: 25 },
      { dimension: "产业链位置", score: 82, weight: 20 },
      { dimension: "盈利质量", score: 72, weight: 15 },
      { dimension: "市场关注度", score: 76, weight: 15 },
    ],
    reasons: ["服务器代工映射清晰", "利润率仍需验证"],
    risks: ["毛利率压力", "美股 capex 预期波动"],
  },
];

export const graphNodes: GraphNode[] = [
  { id: "NVDA", label: "英伟达", type: "company", evidence: ["news:NVDA-guidance", "sec:NVDA-10Q"] },
  { id: "GPU", label: "GPU", type: "product", evidence: ["industry:accelerator-demand"] },
  { id: "CLOUD", label: "云厂商", type: "customer", evidence: ["capex:top-cloud-vendors"] },
  { id: "BK_CPO", label: "光模块", type: "sector", evidence: ["sector_membership:BK_CPO", "akshare:sector-snapshot"] },
  { id: "300308", label: "中际旭创", type: "company", evidence: ["filing:300308-orders", "quote:300308"] },
  { id: "BK_SERVER", label: "AI 服务器", type: "sector", evidence: ["sector_membership:BK_SERVER"] },
  { id: "COPPER", label: "铜", type: "raw", evidence: ["commodity:copper-futures"] },
];

export const graphEdges: GraphEdge[] = [
  {
    id: "e1",
    source: "NVDA",
    target: "GPU",
    label: "需求指引",
    strength: 0.82,
    confidence: 0.88,
    evidence: ["news:NVDA-guidance", "capex:cloud-commentary"],
  },
  {
    id: "e2",
    source: "GPU",
    target: "CLOUD",
    label: "capex 传导",
    strength: 0.74,
    confidence: 0.76,
    evidence: ["capex:top-cloud-vendors", "industry:server-demand"],
  },
  {
    id: "e3",
    source: "CLOUD",
    target: "BK_CPO",
    label: "800G 订单",
    strength: 0.86,
    confidence: 0.81,
    evidence: ["filing:optical-orders", "sector_membership:BK_CPO"],
  },
  {
    id: "e4",
    source: "BK_CPO",
    target: "300308",
    label: "龙头弹性",
    strength: 0.79,
    confidence: 0.84,
    evidence: ["leader_score:300308", "quote:300308"],
  },
  {
    id: "e5",
    source: "GPU",
    target: "BK_SERVER",
    label: "服务器需求",
    strength: 0.69,
    confidence: 0.72,
    evidence: ["industry:server-demand"],
  },
  {
    id: "e6",
    source: "COPPER",
    target: "BK_CPO",
    label: "成本扰动",
    strength: 0.32,
    confidence: 0.57,
    stale: true,
    evidence: ["commodity:copper-futures", "staleness:edge-review"],
  },
];

export const events: MarketEvent[] = [
  {
    id: "EVT_NVDA_GUIDE",
    title: "英伟达盘后指引下修 4%",
    source: "美股财报",
    time: "2026-05-08 08:25",
    summary: "管理层对下一季数据中心收入给出偏保守区间，市场下调短期 capex 斜率。",
    affectedSectors: ["光模块", "AI 服务器", "高速 PCB", "液冷"],
    paths: [
      {
        from: "英伟达",
        through: "云厂商 capex",
        to: "光模块",
        impact: "negative",
        confidence: 0.78,
      },
      {
        from: "英伟达",
        through: "GPU 出货节奏",
        to: "AI 服务器",
        impact: "watch",
        confidence: 0.71,
      },
      {
        from: "英伟达",
        through: "高速互联需求",
        to: "高速 PCB",
        impact: "negative",
        confidence: 0.64,
      },
    ],
  },
];

export const artifacts: Artifact[] = [
  {
    runId: "run_cpo_leader_20260508",
    title: "光模块龙头评分拆解",
    skill: "龙头识别",
    subject: "光模块",
    asOf: "2026-05-08 15:10",
    summary: "光模块板块热度维持高位，中际旭创凭借订单验证和盈利质量继续领跑。",
    highlights: ["综合分 0.86，日变动 +0.04", "五维覆盖 5/5", "主要风险来自海外 capex 与汇率"],
    charts: [
      { id: "leader-radar", title: "五维评分雷达图", kind: "radar" },
      { id: "leader-trend", title: "评分趋势", kind: "line" },
    ],
    conclusions: [
      {
        id: "c1",
        relationClass: "fact",
        text: "中际旭创在当前光模块候选池排名第一。",
        confidence: 0.92,
        evidence: ["leader_score snapshot 2026-05-08", "板块成员覆盖 5/5"],
      },
      {
        id: "c2",
        relationClass: "inferred",
        text: "海外云厂商订单节奏是短期评分变化的主要驱动。",
        confidence: 0.76,
        evidence: ["公告摘录", "成交额分位变化"],
      },
    ],
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
  },
  {
    runId: "run_nvda_impact_20260508",
    title: "英伟达事件跨市场影响路径",
    skill: "跨市场影响分析",
    subject: "英伟达盘后指引",
    asOf: "2026-05-08 08:40",
    summary: "事件主要通过云厂商 capex、GPU 出货节奏和高速互联需求传导到 A 股算力链。",
    highlights: ["光模块短期承压但需跟踪订单验证", "AI 服务器进入观察状态", "高速 PCB 置信度中等"],
    charts: [{ id: "impact-network", title: "跨市场影响图", kind: "network" }],
    conclusions: [
      {
        id: "c3",
        relationClass: "statistical",
        text: "过去 8 次同类事件中，光模块板块 T+1 相对收益中位数为 -1.1%。",
        confidence: 0.69,
        evidence: ["事件窗口回看", "板块收益快照"],
      },
    ],
    graph: {
      nodes: graphNodes,
      edges: graphEdges,
    },
  },
];

export const alerts: AlertSummary[] = [
  {
    id: "alert_cpo_leader",
    title: "光模块综合分变动 +0.04",
    time: "09:35",
    priority: "high",
    state: "active",
    subjectType: "sector",
    subjectId: "BK_CPO",
    trigger: "leader_score.composite changed_by >= 0.03",
    context: "中际旭创领跑，成交额分位和盈利质量同步上行。",
    followUp: "继续观察海外 capex 指引与 800G 订单验证。",
    evidence: ["score_snapshot:2026-05-08", "sector_membership:BK_CPO"],
    artifactRunId: "run_cpo_leader_20260508",
    openChatThreadId: "thread_cpo",
    strategyId: "strategy_cpo_leader",
  },
  {
    id: "alert_nvda_impact",
    title: "英伟达盘后跌 4%，关注算力链",
    time: "08:28",
    priority: "medium",
    state: "sent",
    subjectType: "event",
    subjectId: "EVT_NVDA_GUIDE",
    trigger: "event.us_leader_move within 30m",
    context: "跨市场路径指向光模块、AI 服务器、高速 PCB。",
    followUp: "等待 A 股开盘后验证板块资金强度。",
    evidence: ["news:NVDA-guidance", "relation_path:NVDA-BK_CPO"],
    artifactRunId: "run_nvda_impact_20260508",
    openChatThreadId: "thread_nvda",
    strategyId: "strategy_us_impact",
  },
  {
    id: "alert_watch_bond",
    title: "美债 10Y 距阈值 4.5% 还差 0.18%",
    time: "持续观察",
    priority: "low",
    state: "deferred",
    subjectType: "market",
    subjectId: "market",
    trigger: "us10y >= 4.5",
    context: "阈值类策略尚未命中，仍进入持续观察。",
    followUp: "触发后检查成长股估值与北向资金。",
    evidence: ["fred:US10Y", "market_snapshot:2026-05-08"],
    artifactRunId: "run_nvda_impact_20260508",
    strategyId: "strategy_bond_yield",
  },
];

export const chatThreads: ChatThread[] = [
  {
    id: "thread_cpo",
    title: "光模块龙头讨论",
    pinned: true,
    tags: ["光模块", "龙头"],
    updatedAt: "09:42",
    subject: "BK_CPO",
    messages: [
      {
        id: "m1",
        role: "system",
        time: "09:35",
        content: "提醒触发：光模块综合分变动 +0.04，已打开研究 thread。",
        artifactRunId: "run_cpo_leader_20260508",
      },
      {
        id: "m2",
        role: "user",
        time: "09:37",
        content: "为什么综合分上升？",
      },
      {
        id: "m3",
        role: "assistant",
        time: "09:38",
        content: "主要来自成长质量和市场关注度抬升。工具调用返回订单证据、成交额分位和风险标签。",
        artifactRunId: "run_cpo_leader_20260508",
        trace: ["调用 龙头识别", "读取 sector latest", "生成 Artifact"],
        tokenUsage: 1284,
      },
    ],
  },
  {
    id: "thread_nvda",
    title: "英伟达传导链",
    pinned: true,
    tags: ["美股", "事件"],
    updatedAt: "08:42",
    subject: "EVT_NVDA_GUIDE",
    messages: [
      {
        id: "m4",
        role: "system",
        time: "08:28",
        content: "提醒触发：英伟达盘后跌 4%，自动生成跨市场影响分析。",
        artifactRunId: "run_nvda_impact_20260508",
      },
      {
        id: "m5",
        role: "assistant",
        time: "08:40",
        content: "影响路径集中在云厂商 capex、GPU 出货节奏和高速互联需求。",
        artifactRunId: "run_nvda_impact_20260508",
        trace: ["调用 事件解释器", "匹配 A 股板块", "生成影响路径"],
        tokenUsage: 962,
      },
    ],
  },
];

export const strategies: Strategy[] = [
  {
    id: "strategy_cpo_leader",
    name: "光模块龙头日变动",
    skill: "龙头识别",
    schedule: "每日 09:35",
    enabled: true,
    status: "今日 1 次命中",
    hitCountToday: 1,
    hitCount7d: 12,
    recentArtifactRunId: "run_cpo_leader_20260508",
    dsl: `trigger: cron "35 9 * * 1-5"
skill: leader_identification
subject:
  sector: BK_CPO
condition:
  leader_score.composite:
    changed_by: ">= 0.03"
action:
  alert: web
  open_chat: true`,
  },
  {
    id: "strategy_us_impact",
    name: "美股 AI 龙头异动",
    skill: "跨市场影响分析",
    schedule: "事件到达",
    enabled: true,
    status: "7 日 3 次命中",
    hitCountToday: 1,
    hitCount7d: 3,
    thresholdDistance: "等待事件",
    recentArtifactRunId: "run_nvda_impact_20260508",
    dsl: `trigger: event.us_leader_move
subject:
  company: NVDA
condition:
  price.change_after_hours: "<= -3%"
action:
  alert: web`,
  },
  {
    id: "strategy_bond_yield",
    name: "美债 10Y 突破",
    skill: "阈值监控",
    schedule: "实时",
    enabled: false,
    status: "暂停",
    hitCountToday: 0,
    hitCount7d: 0,
    thresholdDistance: "距离阈值 +0.18%",
    dsl: `trigger: realtime
metric: us10y
condition: ">= 4.5"
action:
  alert: daily_digest`,
  },
];

export const skills: SkillCard[] = [
  {
    id: "leader_identification",
    name: "龙头识别",
    description: "输出板块前三龙头、五维评分、入选原因和风险标签。",
    schema: "sector_id -> leader_score[] + artifact",
    enabled: true,
    strategyRefs: 1,
    lastRun: "2026-05-08 09:35",
  },
  {
    id: "market_impact",
    name: "跨市场影响分析",
    description: "把美股、商品、利率事件映射到 A 股板块和个股路径。",
    schema: "event_id -> relation_path[] + artifact",
    enabled: true,
    strategyRefs: 1,
    lastRun: "2026-05-08 08:40",
  },
  {
    id: "threshold_monitor",
    name: "阈值监控",
    description: "跟踪可计算距离的指标阈值，用于持续观察与提醒。",
    schema: "metric + operator -> alert",
    enabled: false,
    strategyRefs: 1,
    lastRun: "2026-05-07 15:00",
  },
];

export const commandItems: CommandItem[] = [
  ...sectors.map((sector) => ({
    id: `sector-${sector.id}`,
    label: sector.name,
    description: `板块 · 龙头 ${sector.leader}`,
    href: `/analysis/sector/${sector.id}`,
    group: "Subject" as const,
  })),
  ...stocks.map((stock) => ({
    id: `stock-${stock.code}`,
    label: stock.name,
    description: `个股 · ${stock.sectorName}`,
    href: `/analysis/stock/${stock.code}`,
    group: "Subject" as const,
  })),
  ...events.map((event) => ({
    id: `event-${event.id}`,
    label: event.title,
    description: `事件 · ${event.source}`,
    href: `/analysis/event/${event.id}`,
    group: "Subject" as const,
  })),
  ...artifacts.map((artifact) => ({
    id: `artifact-${artifact.runId}`,
    label: artifact.title,
    description: `Artifact · ${artifact.skill}`,
    href: `/artifacts/${artifact.runId}`,
    group: "Artifact" as const,
  })),
  {
    id: "quick-chat",
    label: "快速提问",
    description: "新建 Chat thread",
    href: "/chat",
    group: "Action",
  },
];

export const getSector = (id: string) => sectors.find((sector) => sector.id === id) ?? sectors[0];

export const getStock = (code: string) => stocks.find((stock) => stock.code === code) ?? stocks[0];

export const getEvent = (id: string) => events.find((event) => event.id === id) ?? events[0];

export const getArtifact = (runId: string) =>
  artifacts.find((artifact) => artifact.runId === runId) ?? artifacts[0];

export const getThread = (threadId?: string) =>
  chatThreads.find((thread) => thread.id === threadId) ?? chatThreads[0];

export const getStrategy = (id: string) =>
  strategies.find((strategy) => strategy.id === id) ?? strategies[0];
