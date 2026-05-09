from typing import Any

from app.runtime.schemas import Artifact, ChartSpec, Conclusion, Highlight, SubjectRef


def sector_center_artifact(sector_id: str) -> Artifact:
    return _artifact(
        skill="sector_center",
        subject=SubjectRef(type="sector", id=sector_id, name="光模块"),
        summary="光模块板块维持高热度, 龙头成交额与盈利质量同步占优。",
        highlights=[
            Highlight(level="info", text="中际旭创、新易盛、华工科技位列成交额前三。"),
            Highlight(level="warn", text="产业链 fact 边覆盖仍有限, 已降低结论置信度。"),
        ],
        conclusions=[
            Conclusion(
                claim="光模块板块热度高于近一月均值",
                relation_class="statistical",
                confidence=0.78,
                evidence=["ev_sector_turnover_001"],
            )
        ],
        data={
            "sector_id": sector_id,
            "members": [
                {"symbol": "300308", "name": "中际旭创", "return_pct": 3.2, "heat": 0.91},
                {"symbol": "300502", "name": "新易盛", "return_pct": 2.6, "heat": 0.84},
                {"symbol": "000988", "name": "华工科技", "return_pct": 1.4, "heat": 0.72},
            ],
            "fund_flow": {"net_inflow": 186_000_000, "rank_percentile": 0.86},
            "valuation": {"pe_ttm": 39.2, "percentile": 0.62},
        },
        charts=[
            ChartSpec(
                type="bar",
                title="板块成员热度",
                series=[{"name": "heat", "data": [0.91, 0.84, 0.72]}],
            )
        ],
    )


def leader_identification_artifact(sector_id: str) -> Artifact:
    leaders = [
        {
            "rank": 1,
            "symbol": "300308",
            "name": "中际旭创",
            "composite": 0.86,
            "weight_template_version": "tech-v1",
            "breakdown": {
                "scale": 0.88,
                "profitability": 0.82,
                "growth": 0.9,
                "attention": 0.85,
                "chain_position": 0.74,
            },
            "metric_coverage": 0.82,
            "missing_metrics": ["institutional_ownership"],
        },
        {
            "rank": 2,
            "symbol": "300502",
            "name": "新易盛",
            "composite": 0.81,
            "weight_template_version": "tech-v1",
            "breakdown": {
                "scale": 0.75,
                "profitability": 0.8,
                "growth": 0.87,
                "attention": 0.83,
                "chain_position": 0.7,
            },
            "metric_coverage": 0.78,
            "missing_metrics": ["customer_concentration_detail"],
        },
    ]
    first_breakdown = leaders[0]["breakdown"]
    assert isinstance(first_breakdown, dict)
    return _artifact(
        skill="leader_identification",
        subject=SubjectRef(type="sector", id=sector_id, name="光模块"),
        summary="光模块板块龙头排序: 中际旭创综合分 0.86 暂居第一。",
        highlights=[Highlight(level="info", text="tech-v1 模板下成长性与产业链地位权重合计 50%。")],
        conclusions=[
            Conclusion(
                claim="中际旭创为光模块板块当前龙头一",
                relation_class="statistical",
                confidence=0.82,
                evidence=["ev_metric_001", "ev_manual_nvda_cpo"],
            )
        ],
        data={"sector_id": sector_id, "profile": "tech", "leaders": leaders},
        charts=[
            ChartSpec(
                type="radar",
                title="五维评分拆解",
                series=[{"name": "中际旭创", "data": list(first_breakdown.values())}],
            )
        ],
    )


def long_term_value_artifact(symbol: str) -> Artifact:
    return _artifact(
        skill="long_term_value",
        subject=SubjectRef(type="symbol", id=symbol, name="中际旭创"),
        summary="中际旭创长期价值评分偏正面, 但客户集中度需持续跟踪。",
        highlights=[
            Highlight(level="info", text="ROE 与收入增速位于样本较高分位。"),
            Highlight(level="warn", text="治理风险标签: customer_concentration。"),
        ],
        conclusions=[
            Conclusion(
                claim="中际旭创长期价值评分高于观察阈值",
                relation_class="statistical",
                confidence=0.76,
                evidence=["ev_fundamental_300308"],
            )
        ],
        data={
            "symbol": symbol,
            "fundamental_score": 0.81,
            "valuation_percentile": 0.62,
            "governance_risk_tags": ["customer_concentration"],
        },
        charts=[
            ChartSpec(
                type="line",
                title="估值分位",
                series=[{"name": "percentile", "data": [0.55, 0.58, 0.62]}],
            )
        ],
    )


def market_overview_artifact() -> Artifact:
    return _artifact(
        skill="market_overview",
        subject=SubjectRef(type="market", id="CN_A", name="A股市场"),
        summary="市场宽度回升, 科技成长方向资金承接更强。",
        highlights=[
            Highlight(level="info", text="上涨家数占比 62%。"),
            Highlight(level="info", text="热点集中在 AI 算力、光模块和 PCB。"),
        ],
        conclusions=[
            Conclusion(
                claim="A股市场短线风险偏好回升",
                relation_class="statistical",
                confidence=0.69,
                evidence=["ev_market_breadth_001"],
            )
        ],
        data={
            "indexes": [{"id": "000300", "name": "沪深300", "return_pct": 0.8}],
            "breadth": {"advancers_ratio": 0.62},
            "hotspots": ["AI算力", "光模块", "PCB"],
        },
        charts=[
            ChartSpec(
                type="bar",
                title="热点强度",
                series=[{"name": "strength", "data": [0.9, 0.86, 0.74]}],
            )
        ],
    )


def event_impact_artifact(event_id: str) -> Artifact:
    return _artifact(
        skill="market_impact",
        subject=SubjectRef(type="event", id=event_id, name="英伟达事件跨市场影响路径"),
        summary="事件主要通过云厂商 capex、GPU 出货节奏和高速互联需求传导到 A 股算力链。",
        highlights=[
            Highlight(level="warn", text="光模块短期承压但需跟踪订单验证。"),
            Highlight(level="info", text="AI 服务器进入观察状态。"),
        ],
        conclusions=[
            Conclusion(
                claim="英伟达盘后指引会通过云厂商 capex 影响 A 股算力链",
                relation_class="inferred",
                confidence=0.78,
                evidence=["news:NVDA-guidance", "relation_path:NVDA-BK_CPO"],
            )
        ],
        data={
            "event_id": event_id,
            "paths": [
                {"from": "英伟达", "through": "云厂商 capex", "to": "光模块", "impact": "negative"},
                {"from": "英伟达", "through": "GPU 出货节奏", "to": "AI 服务器", "impact": "watch"},
            ],
        },
        charts=[ChartSpec(type="graph", title="跨市场影响图", series=[])],
    )


def supply_chain_artifact(symbol: str) -> Artifact:
    return _artifact(
        skill="supply_chain_analysis",
        subject=SubjectRef(type="symbol", id=symbol, name="中际旭创"),
        summary="中际旭创产业链上游受 AI GPU 需求拉动, 下游客户集中度是主要观察点。",
        highlights=[
            Highlight(level="info", text="NVDA → 光模块 → 中际旭创路径置信度 0.88。"),
            Highlight(level="warn", text="高价值边以手工 fact 边为主, 覆盖有限。"),
        ],
        conclusions=[
            Conclusion(
                claim="英伟达 AI 服务器需求对中际旭创形成正向影响路径",
                relation_class="fact",
                confidence=0.88,
                evidence=["ev_manual_nvda_cpo"],
            )
        ],
        data={
            "symbol": symbol,
            "nodes": [
                {"id": "NVDA", "label": "英伟达", "type": "us_leader"},
                {"id": "BK_CPO", "label": "光模块", "type": "sector"},
                {"id": symbol, "label": "中际旭创", "type": "symbol"},
            ],
            "edges": [
                {
                    "source": "NVDA",
                    "target": "BK_CPO",
                    "relation": "influences",
                    "confidence": 0.88,
                },
                {"source": "BK_CPO", "target": symbol, "relation": "contains", "confidence": 0.95},
            ],
        },
        charts=[ChartSpec(type="graph", title="产业链影响路径", series=[])],
    )


def _artifact(
    *,
    skill: str,
    subject: SubjectRef,
    summary: str,
    highlights: list[Highlight],
    conclusions: list[Conclusion],
    data: dict[str, Any],
    charts: list[ChartSpec],
) -> Artifact:
    run_id_hint = f"{skill}/{subject.id}"
    return Artifact(
        skill=skill,
        subject=subject,
        summary=summary,
        highlights=highlights,
        conclusions=conclusions,
        data=data,
        charts=charts,
        raw_pointer=f"/runs/mock/{run_id_hint}/raw/",
    )
