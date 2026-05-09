from datetime import UTC, datetime
from typing import Any, Literal
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

RelationClass = Literal["fact", "statistical", "inferred"]
HighlightLevel = Literal["info", "warn", "critical"]


class SubjectRef(BaseModel):
    type: str
    id: str
    name: str | None = None


class Highlight(BaseModel):
    level: HighlightLevel
    text: str


class Conclusion(BaseModel):
    claim: str
    relation_class: RelationClass
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = Field(default_factory=list)


class ChartSpec(BaseModel):
    type: str
    title: str
    series: list[dict[str, Any]] = Field(default_factory=list)


class Artifact(BaseModel):
    run_id: str = Field(default_factory=lambda: str(uuid4()))
    skill: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    subject: SubjectRef
    summary: str
    highlights: list[Highlight] = Field(default_factory=list)
    conclusions: list[Conclusion] = Field(default_factory=list)
    data: dict[str, Any] = Field(default_factory=dict)
    charts: list[ChartSpec] = Field(default_factory=list)
    references: list[str] = Field(default_factory=list)
    raw_pointer: str


class TraceEvent(BaseModel):
    run_id: str
    kind: str
    name: str
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    latency_ms: int = 0
    input: dict[str, Any] = Field(default_factory=dict)
    output: dict[str, Any] = Field(default_factory=dict)


class RunContext(BaseModel):
    trigger_source: str = "api"
    user_id: str | None = None
    parent_run_id: str | None = None
    max_tokens: int = 4000
    max_tool_calls: int = 20


class RunOptions(BaseModel):
    streaming: bool = False
    batch: bool = False
    dry_run: bool = False


class RunRequest(BaseModel):
    skill: str
    input: dict[str, Any] = Field(default_factory=dict)
    context: RunContext = Field(default_factory=RunContext)
    options: RunOptions = Field(default_factory=RunOptions)


class RunUsage(BaseModel):
    tokens: int = 0
    tool_calls: int = 0
    latency_ms: int = 0


class RunResult(BaseModel):
    run_id: UUID
    artifact: Artifact
    trace: list[TraceEvent] = Field(default_factory=list)
    usage: RunUsage = Field(default_factory=RunUsage)
