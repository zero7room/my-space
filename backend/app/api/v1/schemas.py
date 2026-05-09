from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.orchestration.alerts import AlertPriority, SubjectRef
from app.runtime.schemas import Artifact, Conclusion, Highlight

AlertState = Literal["active", "capped", "deferred", "suppressed", "sent", "merged"]


class SectorLatestResponse(BaseModel):
    id: str
    name: str
    summary: str
    as_of: datetime
    metric_coverage: float = Field(ge=0, le=1)
    leaders: list[dict[str, Any]]
    members: list[dict[str, Any]]
    fund_flow: dict[str, Any]
    valuation: dict[str, Any]
    artifact: Artifact


class SymbolLatestResponse(BaseModel):
    code: str
    name: str
    sector_id: str
    summary: str
    leader_score: dict[str, Any]
    value: dict[str, Any]
    supply_chain: dict[str, Any]
    artifacts: list[Artifact]


class RunResponse(BaseModel):
    id: str
    skill: str
    state: str
    artifact_run_id: str
    usage: dict[str, Any] = Field(default_factory=dict)
    trace: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime


class ArtifactResponse(Artifact):
    pass


class AlertResponse(BaseModel):
    alert_id: UUID
    rule_id: str
    subject: SubjectRef
    priority: AlertPriority
    title: str
    summary: str
    evidence: list[str]
    artifact_run_id: str | None = None
    open_chat_thread_id: str | None = None
    parent_alert_id: UUID | None = None
    channels: dict[str, object] = Field(default_factory=dict)
    state: AlertState
    reason: str | None = None
    ctx: dict[str, object] = Field(default_factory=dict)
    follow_up: dict[str, object] = Field(default_factory=dict)
    created_at: datetime
    sent_at: datetime | None = None


class AlertListResponse(BaseModel):
    items: list[AlertResponse]


class StrategyResponse(BaseModel):
    id: str
    name: str
    enabled: bool
    dsl: dict[str, Any]
    last_candidate: dict[str, Any] | None = None


class StrategyListResponse(BaseModel):
    items: list[StrategyResponse]


class AnalysisArtifactResponse(Artifact):
    conclusions: list[Conclusion]
    highlights: list[Highlight]
