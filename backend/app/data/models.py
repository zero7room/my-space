from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    event,
    text,
)
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app.data.base import metadata


def new_uuid() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    metadata = metadata


class EvidenceLink(Base):
    __tablename__ = "evidence_link"

    owner_type: Mapped[str] = mapped_column(String(80), primary_key=True)
    owner_id: Mapped[str] = mapped_column(String(80), primary_key=True)
    evidence_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("evidence.id", ondelete="CASCADE"),
        primary_key=True,
    )


class Company(Base):
    __tablename__ = "company"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    country: Mapped[str | None] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    stocks: Mapped[list[Stock]] = relationship(back_populates="company")


class Stock(Base):
    __tablename__ = "stock"
    __table_args__ = (UniqueConstraint("symbol", "exchange"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False)
    exchange: Mapped[str] = mapped_column(String(32), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    company_id: Mapped[str] = mapped_column(ForeignKey("company.id"), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(8))
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )

    company: Mapped[Company] = relationship(back_populates="stocks")
    evidence_links: Mapped[list[EvidenceLink]] = relationship(
        primaryjoin=(
            "and_(Stock.id == foreign(EvidenceLink.owner_id), EvidenceLink.owner_type == 'stock')"
        ),
        cascade="all, delete-orphan",
    )
    evidence = association_proxy(
        "evidence_links",
        "evidence_id",
        creator=lambda evidence_id: EvidenceLink(owner_type="stock", evidence_id=str(evidence_id)),
    )


class Product(Base):
    __tablename__ = "product"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    category: Mapped[str | None] = mapped_column(String(80))
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class Commodity(Base):
    __tablename__ = "commodity"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    unit: Mapped[str | None] = mapped_column(String(32))
    currency: Mapped[str | None] = mapped_column(String(8))
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class MarketVariable(Base):
    __tablename__ = "market_variable"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class MarketEvent(Base):
    __tablename__ = "market_event"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class SectorCanonical(Base):
    __tablename__ = "sector_canonical"
    __table_args__ = (
        CheckConstraint(
            "type in ('industry', 'concept', 'index', 'region', 'theme')",
            name="sector_canonical_type",
        ),
    )

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    profile: Mapped[str | None] = mapped_column(String(32))
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class SectorProvider(Base):
    __tablename__ = "sector_provider"
    __table_args__ = (UniqueConstraint("provider", "provider_code"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    provider: Mapped[str] = mapped_column(String(80), nullable=False)
    provider_code: Mapped[str] = mapped_column(String(80), nullable=False)
    provider_name: Mapped[str] = mapped_column(String(255), nullable=False)
    raw: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class SectorMapping(Base):
    __tablename__ = "sector_mapping"
    __table_args__ = (
        UniqueConstraint("provider_sector_id", "canonical_sector_id", "as_of"),
        CheckConstraint("relevance >= 0 and relevance <= 1", name="sector_mapping_relevance"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    provider_sector_id: Mapped[str] = mapped_column(
        ForeignKey("sector_provider.id"), nullable=False
    )
    canonical_sector_id: Mapped[str] = mapped_column(
        ForeignKey("sector_canonical.id"), nullable=False
    )
    relevance: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    provider_sector: Mapped[SectorProvider] = relationship()
    canonical_sector: Mapped[SectorCanonical] = relationship()


class SectorMembership(Base):
    __tablename__ = "sector_membership"
    __table_args__ = (
        UniqueConstraint("stock_id", "sector_id", "as_of"),
        CheckConstraint("relevance >= 0 and relevance <= 1", name="sector_membership_relevance"),
        CheckConstraint("confidence >= 0 and confidence <= 1", name="sector_membership_confidence"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    stock_id: Mapped[str] = mapped_column(ForeignKey("stock.id"), nullable=False)
    sector_id: Mapped[str] = mapped_column(ForeignKey("sector_canonical.id"), nullable=False)
    relevance: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.70")
    )
    confidence: Mapped[Decimal] = mapped_column(
        Numeric(6, 4), nullable=False, default=Decimal("0.80")
    )
    eligible: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    stock: Mapped[Stock] = relationship()
    sector: Mapped[SectorCanonical] = relationship()


@event.listens_for(SectorMembership, "before_insert")
@event.listens_for(SectorMembership, "before_update")
def set_membership_eligibility(
    _mapper: object,
    _connection: object,
    target: SectorMembership,
) -> None:
    target.eligible = Decimal(target.relevance) * Decimal(target.confidence) >= Decimal("0.5")


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (
        UniqueConstraint("hash"),
        Index("ix_evidence_type_observed_at", "type", text("observed_at DESC")),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    url_or_path: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(String(255))
    excerpt: Mapped[str | None] = mapped_column(String(200))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    hash: Mapped[str] = mapped_column(String(128), nullable=False)
    lang: Mapped[str | None] = mapped_column(String(8))
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Edge(Base):
    __tablename__ = "edge"
    __table_args__ = (
        CheckConstraint(
            "relation_class in ('fact', 'statistical', 'inferred')",
            name="edge_relation_class",
        ),
        CheckConstraint(
            "direction in ('positive', 'negative', 'nonlinear', 'uncertain')",
            name="edge_direction",
        ),
        CheckConstraint("strength >= 0 and strength <= 1", name="edge_strength"),
        CheckConstraint("confidence >= 0 and confidence <= 1", name="edge_confidence"),
        Index(
            "uq_edge_active_identity",
            "type",
            "from_entity_type",
            "from_entity_id",
            "to_entity_type",
            "to_entity_id",
            "relation_class",
            unique=True,
            postgresql_where=text("revoked_at IS NULL"),
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    from_entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    from_entity_id: Mapped[str] = mapped_column(String(80), nullable=False)
    to_entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    to_entity_id: Mapped[str] = mapped_column(String(80), nullable=False)
    direction: Mapped[str] = mapped_column(String(24), nullable=False)
    strength: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    confidence: Mapped[Decimal] = mapped_column(Numeric(6, 4), nullable=False)
    relation_class: Mapped[str] = mapped_column(String(24), nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=now_utc, onupdate=now_utc
    )
    expires_hint: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_reason: Mapped[str | None] = mapped_column(Text)
    revoked_by: Mapped[str | None] = mapped_column(String(36), ForeignKey("evidence.id"))
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class FinancialMetric(Base):
    __tablename__ = "financial_metric"
    __table_args__ = (
        UniqueConstraint("subject_type", "subject_id", "metric_name", "as_of", "source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    subject_type: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(80), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(8))
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class MarketMetric(Base):
    __tablename__ = "market_metric"
    __table_args__ = (
        UniqueConstraint("subject_type", "subject_id", "metric_name", "as_of", "source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    subject_type: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(80), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    currency: Mapped[str | None] = mapped_column(String(8))
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class SectorMetric(Base):
    __tablename__ = "sector_metric"
    __table_args__ = (UniqueConstraint("sector_id", "metric_name", "as_of", "source"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    sector_id: Mapped[str] = mapped_column(String(80), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(120), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(24, 8), nullable=False)
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class LeaderScore(Base):
    __tablename__ = "leader_score"
    __table_args__ = (
        UniqueConstraint(
            "subject_type", "subject_id", "score_type", "weight_template_version", "as_of"
        ),
        CheckConstraint(
            "relation_class in ('fact', 'statistical', 'inferred')",
            name="leader_score_relation_class",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    subject_type: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(80), nullable=False)
    sector_id: Mapped[str] = mapped_column(String(80), nullable=False)
    score_type: Mapped[str] = mapped_column(String(80), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False)
    weight_template_version: Mapped[str] = mapped_column(String(80), nullable=False)
    baseline: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    relation_class: Mapped[str] = mapped_column(String(24), nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class ImpactScore(Base):
    __tablename__ = "impact_score"
    __table_args__ = (
        UniqueConstraint("subject_type", "subject_id", "event_id", "as_of", "source"),
        CheckConstraint(
            "relation_class in ('fact', 'statistical', 'inferred')",
            name="impact_score_relation_class",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    subject_type: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(80), nullable=False)
    event_id: Mapped[str] = mapped_column(String(80), nullable=False)
    score: Mapped[Decimal] = mapped_column(Numeric(8, 6), nullable=False)
    direction: Mapped[str] = mapped_column(String(24), nullable=False)
    relation_class: Mapped[str] = mapped_column(String(24), nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    as_of: Mapped[Any] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(120), nullable=False)
    extra: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)


class Run(Base):
    __tablename__ = "run"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    skill: Mapped[str] = mapped_column(String(120), nullable=False)
    parent_run_id: Mapped[str | None] = mapped_column(ForeignKey("run.id"))
    trigger_source: Mapped[str] = mapped_column(String(80), nullable=False)
    status: Mapped[str] = mapped_column(String(40), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    usage: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    trace_events: Mapped[list[TraceEvent]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="TraceEvent.idx",
    )
    artifacts: Mapped[list[RunArtifact]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
    )


class TraceEvent(Base):
    __tablename__ = "trace_event"
    __table_args__ = (
        UniqueConstraint("run_id", "idx"),
        Index("ix_trace_event_run_id_idx", "run_id", "idx"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    run_id: Mapped[str] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), nullable=False)
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(80), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)

    run: Mapped[Run] = relationship(back_populates="trace_events")


class RunArtifact(Base):
    __tablename__ = "run_artifact"

    run_id: Mapped[str] = mapped_column(
        ForeignKey("run.id", ondelete="CASCADE"),
        primary_key=True,
    )
    artifact_path: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)

    run: Mapped[Run] = relationship(back_populates="artifacts")


class ConversationThread(Base):
    __tablename__ = "conversation_thread"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    subject_ref: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    last_message_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    references: Mapped[list[ConversationReference]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
    )

    def archive(self) -> None:
        self.archived_at = now_utc()


class ConversationReference(Base):
    __tablename__ = "conversation_reference"
    __table_args__ = (UniqueConstraint("thread_id", "run_id", "evidence_id", "message_idx"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    thread_id: Mapped[str] = mapped_column(
        ForeignKey("conversation_thread.id", ondelete="CASCADE"),
        nullable=False,
    )
    run_id: Mapped[str] = mapped_column(ForeignKey("run.id", ondelete="CASCADE"), nullable=False)
    evidence_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"))
    message_idx: Mapped[int] = mapped_column(Integer, nullable=False)

    thread: Mapped[ConversationThread] = relationship(back_populates="references")
    run: Mapped[Run] = relationship()


class AlertRecord(Base):
    __tablename__ = "alert_record"
    __table_args__ = (
        CheckConstraint("priority in ('high', 'medium', 'low')", name="alert_record_priority"),
        CheckConstraint(
            "state in ('active', 'capped', 'deferred', 'suppressed', 'sent', 'merged')",
            name="alert_record_state",
        ),
        Index("ix_alert_record_rule_id_created_at", "rule_id", text("created_at DESC")),
        Index(
            "ix_alert_record_subject_created_at",
            "subject_type",
            "subject_id",
            text("created_at DESC"),
        ),
        Index("ix_alert_record_state_created_at", "state", text("created_at DESC")),
    )

    alert_id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    rule_id: Mapped[str] = mapped_column(String(120), nullable=False)
    alert_type: Mapped[str] = mapped_column(String(120), nullable=False)
    subject_type: Mapped[str] = mapped_column(String(40), nullable=False)
    subject_id: Mapped[str] = mapped_column(String(120), nullable=False)
    subject_name: Mapped[str | None] = mapped_column(String(255))
    priority: Mapped[str] = mapped_column(String(16), nullable=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False, default="active")
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    artifact_run_id: Mapped[str | None] = mapped_column(String(120))
    open_chat_thread_id: Mapped[str | None] = mapped_column(String(120))
    parent_alert_id: Mapped[str | None] = mapped_column(ForeignKey("alert_record.alert_id"))
    channels: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    ctx: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    follow_up: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


__all__ = [
    "ActiveEdge",
    "AlertRecord",
    "Commodity",
    "Company",
    "ConversationReference",
    "ConversationThread",
    "Edge",
    "Evidence",
    "EvidenceLink",
    "FinancialMetric",
    "ImpactScore",
    "LatestMetric",
    "LeaderScore",
    "MarketEvent",
    "MarketMetric",
    "MarketVariable",
    "Product",
    "Run",
    "RunArtifact",
    "SectorCanonical",
    "SectorMapping",
    "SectorMembership",
    "SectorMetric",
    "SectorProvider",
    "Stock",
    "TraceEvent",
    "pg_insert",
]


class ActiveEdge(Base):
    __tablename__ = "v_active_edge"
    __table_args__ = {"info": {"is_view": True}}

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    type: Mapped[str] = mapped_column(String(80))
    from_entity_type: Mapped[str] = mapped_column(String(40))
    from_entity_id: Mapped[str] = mapped_column(String(80))
    to_entity_type: Mapped[str] = mapped_column(String(40))
    to_entity_id: Mapped[str] = mapped_column(String(80))
    direction: Mapped[str] = mapped_column(String(24))
    strength: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    confidence: Mapped[Decimal] = mapped_column(Numeric(6, 4))
    relation_class: Mapped[str] = mapped_column(String(24))
    evidence: Mapped[list[str]] = mapped_column(JSON)


class LatestMetric(Base):
    __tablename__ = "v_latest_metric"
    __table_args__ = {"info": {"is_view": True}}

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    metric_family: Mapped[str] = mapped_column(String(40))
    subject_type: Mapped[str] = mapped_column(String(40))
    subject_id: Mapped[str] = mapped_column(String(80))
    metric_name: Mapped[str] = mapped_column(String(120))
    value: Mapped[Decimal] = mapped_column(Numeric(24, 8))
    as_of: Mapped[Any] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(120))
