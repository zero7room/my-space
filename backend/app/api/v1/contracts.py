from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException

from app.api.v1.schemas import (
    AlertListResponse,
    AlertResponse,
    ArtifactResponse,
    RunResponse,
    SectorLatestResponse,
    StrategyListResponse,
    StrategyResponse,
    SymbolLatestResponse,
)
from app.orchestration.alerts import seeded_alert_store
from app.skills.core import (
    event_impact_artifact,
    leader_identification_artifact,
    long_term_value_artifact,
    sector_center_artifact,
    supply_chain_artifact,
)

router = APIRouter(prefix="/api/v1", tags=["contracts"])

_ALERT_STORE = seeded_alert_store()
_KNOWN_SECTORS = {"BK_CPO"}
_KNOWN_SYMBOLS = {"300308", "300308.SZ"}
_EVENT_ARTIFACT_RUNS = {"run_nvda_impact_20260508"}
_LEADER_ARTIFACT_RUNS = {"demo-run", "run_cpo_leader_20260508", "run-leader-BK_CPO"}


@router.get("/sectors/{sector_id}/latest", response_model=SectorLatestResponse)
async def get_sector_latest(sector_id: str) -> SectorLatestResponse:
    if sector_id not in _KNOWN_SECTORS:
        raise HTTPException(status_code=404, detail="Sector not found")
    sector = sector_center_artifact(sector_id)
    leaders = leader_identification_artifact(sector_id)
    return SectorLatestResponse(
        id=sector_id,
        name=sector.subject.name or sector_id,
        summary=sector.summary,
        as_of=sector.created_at,
        metric_coverage=0.82,
        leaders=leaders.data["leaders"],
        members=sector.data["members"],
        fund_flow=sector.data["fund_flow"],
        valuation=sector.data["valuation"],
        artifact=sector,
    )


@router.get("/symbols/{code}/latest", response_model=SymbolLatestResponse)
async def get_symbol_latest(code: str) -> SymbolLatestResponse:
    if code not in _KNOWN_SYMBOLS:
        raise HTTPException(status_code=404, detail="Symbol not found")
    symbol = code.split(".")[0]
    leader = leader_identification_artifact("BK_CPO")
    value = long_term_value_artifact(symbol)
    chain = supply_chain_artifact(symbol)
    leader_row = leader.data["leaders"][0]
    return SymbolLatestResponse(
        code=code,
        name=value.subject.name or symbol,
        sector_id="BK_CPO",
        summary=value.summary,
        leader_score={
            "composite": leader_row["composite"],
            "rank": leader_row["rank"],
            "weight_template_version": leader_row["weight_template_version"],
            "breakdown": leader_row["breakdown"],
        },
        value=value.data,
        supply_chain=chain.data,
        artifacts=[value, chain],
    )


@router.get("/runs/{run_id}", response_model=RunResponse)
async def get_run(run_id: str) -> RunResponse:
    return RunResponse(
        id=run_id,
        skill="leader_identification",
        state="succeeded",
        artifact_run_id=run_id,
        usage={"tokens": 84, "tool_calls": 4, "latency_ms": 18},
        trace=[
            {"kind": "tool", "name": "get_sector_members", "latency_ms": 3},
            {"kind": "skill", "name": "leader_identification", "latency_ms": 15},
        ],
        created_at=datetime(2026, 5, 8, 10, 0, tzinfo=UTC),
    )


@router.get("/artifacts/{run_id}", response_model=ArtifactResponse)
async def get_artifact(run_id: str) -> ArtifactResponse:
    if run_id in _EVENT_ARTIFACT_RUNS:
        artifact = event_impact_artifact("EVT_NVDA_GUIDE")
    elif run_id in _LEADER_ARTIFACT_RUNS:
        artifact = leader_identification_artifact("BK_CPO")
    else:
        raise HTTPException(status_code=404, detail="Artifact not found")

    payload = artifact.model_dump()
    payload["run_id"] = run_id
    payload["raw_pointer"] = f"/runs/mock/leader_identification/{run_id}/raw/"
    return ArtifactResponse.model_validate(payload)


@router.get("/alerts", response_model=AlertListResponse)
async def list_alerts() -> AlertListResponse:
    return AlertListResponse(
        items=[
            AlertResponse.model_validate(item.model_dump()) for item in _ALERT_STORE.list_records()
        ]
    )


@router.get("/alerts/{alert_id}", response_model=AlertResponse)
async def get_alert(alert_id: str) -> AlertResponse:
    for alert in _ALERT_STORE.list_records():
        if str(alert.alert_id) == alert_id:
            return AlertResponse.model_validate(alert.model_dump())
    raise HTTPException(status_code=404, detail="Alert not found")


@router.get("/strategies", response_model=StrategyListResponse)
async def list_strategies() -> StrategyListResponse:
    return StrategyListResponse(items=[_demo_strategy()])


@router.get("/strategies/{strategy_id}", response_model=StrategyResponse)
async def get_strategy(strategy_id: str) -> StrategyResponse:
    strategy = _demo_strategy()
    if strategy.id != strategy_id:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


def _demo_strategy() -> StrategyResponse:
    return StrategyResponse(
        id="leader_score_change",
        name="光模块龙头综合分变化",
        enabled=True,
        dsl={
            "skill": "leader_identification",
            "trigger": {"type": "scheduled", "cron": "35 9 * * 1-5"},
            "condition": {
                "all_of": [
                    {
                        "metric": "leader_score.composite",
                        "subject": {"type": "sector", "id": "BK_CPO"},
                        "changed_by": ">= 0.05",
                        "window": "1d",
                    }
                ]
            },
            "output": {
                "priority": "high",
                "message_template": "{subject.name} 综合分变动 {metric.delta:+.2f}",
                "open_chat": True,
            },
        },
        last_candidate={
            "priority": "high",
            "ctx": {"delta": 0.06, "weight_template_version": "tech-v1"},
        },
    )
