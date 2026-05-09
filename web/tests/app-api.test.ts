import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getAlerts,
  getArtifact,
  getSectorLatest,
  getStrategies,
  getStrategy,
  getSymbolLatest,
} from "@/lib/app/api";

describe("app API helper", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to alert fixtures when the API request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("backend offline");
      }),
    );

    const result = await getAlerts();

    expect(result.source).toBe("fallback");
    expect(result.data.map((alert) => alert.id)).toContain("alert_cpo_leader");
  });

  it("normalizes alert list responses from the backend contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          items: [
            {
              alert_id: "11111111-1111-1111-1111-111111111111",
              rule_id: "leader_score_change",
              subject: { type: "sector", id: "BK_CPO", name: "光模块" },
              priority: "high",
              title: "光模块综合分变动 +0.06",
              summary: "中际旭创继续领跑。",
              evidence: ["ev_metric_001"],
              artifact_run_id: "run-leader-BK_CPO",
              open_chat_thread_id: "thread-cpo",
              state: "sent",
              reason: "delivered",
              ctx: { delta: 0.06 },
              follow_up: { window: "next_3_sessions" },
              created_at: "2026-05-08T10:00:00Z",
              sent_at: "2026-05-08T10:00:00Z",
              channels: { in_app: { accepted: true } },
              parent_alert_id: null,
            },
          ],
        }),
      ),
    );

    const result = await getAlerts();

    expect(result.source).toBe("api");
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({
      id: "11111111-1111-1111-1111-111111111111",
      strategyId: "leader_score_change",
      subjectType: "sector",
      subjectId: "BK_CPO",
      trigger: "leader_score_change",
      context: "中际旭创继续领跑。",
      followUp: "next_3_sessions",
      artifactRunId: "run-leader-BK_CPO",
      openChatThreadId: "thread-cpo",
    });
  });

  it("normalizes sector latest responses from the backend contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          id: "BK_CPO",
          name: "光模块",
          summary: "光模块板块维持高热度。",
          as_of: "2026-05-08T10:00:00Z",
          metric_coverage: 0.82,
          leaders: [{ symbol: "300308", name: "中际旭创", composite: 0.86 }],
          members: [{ symbol: "300308", name: "中际旭创", return_pct: 3.2, heat: 0.91 }],
          fund_flow: { net_inflow: 186000000, rank_percentile: 0.86 },
          valuation: { pe_ttm: 39.2 },
          artifact: {
            run_id: "run-sector-BK_CPO",
            skill: "sector_center",
            created_at: "2026-05-08T10:00:00Z",
            subject: { type: "sector", id: "BK_CPO", name: "光模块" },
            summary: "光模块板块维持高热度。",
            highlights: [{ level: "info", text: "成交额前三。" }],
            conclusions: [],
            charts: [],
            raw_pointer: "/runs/mock/sector/raw/",
          },
        }),
      ),
    );

    const result = await getSectorLatest("BK_CPO");

    expect(result.source).toBe("api");
    expect(result.data).toMatchObject({
      id: "BK_CPO",
      name: "光模块",
      change: 3.2,
      heat: 91,
      fundFlow: "+1.86 亿",
      leader: "中际旭创",
      leaderCode: "300308",
      coverage: "82% 覆盖",
      tags: ["高热度", "资金流入"],
    });
  });

  it("normalizes symbol latest responses from the backend contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          code: "300308",
          name: "中际旭创",
          sector_id: "BK_CPO",
          summary: "长期价值评分偏正面。",
          leader_score: {
            composite: 0.86,
            breakdown: {
              scale: 0.88,
              growth: 0.9,
              chain_position: 0.74,
              profitability: 0.82,
              attention: 0.85,
            },
          },
          value: {
            valuation_percentile: 0.62,
            governance_risk_tags: ["customer_concentration"],
          },
          supply_chain: {},
          artifacts: [
            {
              run_id: "run-value-300308",
              skill: "long_term_value",
              created_at: "2026-05-08T10:00:00Z",
              subject: { type: "symbol", id: "300308", name: "中际旭创" },
              summary: "长期价值评分偏正面。",
              highlights: [{ level: "info", text: "ROE 位于较高分位。" }],
              conclusions: [
                {
                  claim: "长期价值评分高于观察阈值",
                  relation_class: "statistical",
                  confidence: 0.76,
                  evidence: ["ev_fundamental_300308"],
                },
              ],
              charts: [],
              raw_pointer: "/runs/mock/value/raw/",
            },
          ],
        }),
      ),
    );

    const result = await getSymbolLatest("300308");

    expect(result.source).toBe("api");
    expect(result.data).toMatchObject({
      code: "300308",
      name: "中际旭创",
      sectorId: "BK_CPO",
      sectorName: "光模块",
      score: 0.86,
      longTermValue: "估值分位 62%",
      risks: ["customer_concentration"],
    });
    expect(result.data?.scoreBreakdown[0]).toMatchObject({ dimension: "规模地位", score: 88 });
  });

  it("normalizes strategy list and detail responses from the backend contract", async () => {
    const strategyPayload = {
      id: "leader_score_change",
      name: "光模块龙头综合分变化",
      enabled: true,
      dsl: {
        skill: "leader_identification",
        trigger: { type: "scheduled", cron: "35 9 * * 1-5" },
      },
      last_candidate: {
        priority: "high",
        ctx: { delta: 0.06 },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ items: [strategyPayload] })),
    );

    const result = await getStrategies();

    expect(result.source).toBe("api");
    expect(result.data[0]).toMatchObject({
      id: "leader_score_change",
      skill: "leader_identification",
      schedule: "35 9 * * 1-5",
      status: "最近候选: high",
      hitCountToday: 1,
      recentArtifactRunId: "run_cpo_leader_20260508",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(strategyPayload)),
    );

    const detail = await getStrategy("leader_score_change");

    expect(detail.source).toBe("api");
    expect(detail.data?.dsl).toContain("leader_identification");
  });

  it("normalizes artifact responses from the backend contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          run_id: "run-leader-BK_CPO",
          skill: "leader_identification",
          created_at: "2026-05-08T10:00:00Z",
          subject: { type: "sector", id: "BK_CPO", name: "光模块" },
          summary: "光模块板块龙头排序。",
          highlights: [{ level: "info", text: "成长性占优。" }],
          conclusions: [
            {
              claim: "中际旭创为当前龙头一",
              relation_class: "statistical",
              confidence: 0.82,
              evidence: ["ev_metric_001"],
            },
          ],
          charts: [{ type: "radar", title: "五维评分拆解", series: [] }],
          raw_pointer: "/runs/mock/leader/raw/",
        }),
      ),
    );

    const result = await getArtifact("run-leader-BK_CPO");

    expect(result.source).toBe("api");
    expect(result.data).toMatchObject({
      runId: "run-leader-BK_CPO",
      title: "光模块 龙头识别",
      subject: "光模块",
      highlights: ["成长性占优。"],
      charts: [{ id: "chart-0", title: "五维评分拆解", kind: "radar" }],
    });
    expect(result.data?.conclusions[0]).toMatchObject({
      relationClass: "statistical",
      text: "中际旭创为当前龙头一",
    });
  });

  it("returns an empty result for an unknown sector id instead of the first fixture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ detail: "not found" }, { status: 404 }),
      ),
    );

    const result = await getSectorLatest("UNKNOWN_SECTOR");

    expect(result.source).toBe("fallback");
    expect(result.data).toBeNull();
    expect(result.error).toContain("UNKNOWN_SECTOR");
  });
});
