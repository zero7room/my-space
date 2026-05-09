from datetime import UTC, date, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.data import models


class ConclusionType(StrEnum):
    EDGE = "edge"
    LEADER_SCORE = "leader_score"
    IMPACT_SCORE = "impact_score"


class RejectionReason(StrEnum):
    MISSING_EVIDENCE = "missing_evidence"
    MISSING_RELATION_CLASS = "missing_relation_class"
    UNKNOWN_SUBJECT = "unknown_subject"
    VERSION_MISMATCH = "version_mismatch"


class Conclusion(BaseModel):
    type: ConclusionType
    relation_class: Literal["fact", "statistical", "inferred"] | None = None
    evidence: list[str] = Field(default_factory=list)
    source_kind: str | None = None
    relation_type: str | None = None
    from_entity_type: str | None = None
    from_entity_id: str | None = None
    to_entity_type: str | None = None
    to_entity_id: str | None = None
    direction: Literal["positive", "negative", "nonlinear", "uncertain"] | None = None
    strength: Decimal | None = None
    confidence: Decimal | None = None
    expires_hint: datetime | None = None
    subject_type: str | None = None
    subject_id: str | None = None
    sector_id: str | None = None
    score_type: str = "leader"
    score: Decimal | None = None
    weight_template_version: str | None = None
    baseline: bool = False
    event_id: str | None = None
    as_of: date | None = None
    source: str = "artifact"


class ConclusionRef(BaseModel):
    type: ConclusionType
    id: str


class RejectedConclusion(BaseModel):
    reason: RejectionReason
    index: int
    detail: str


class SinkResult(BaseModel):
    accepted: list[ConclusionRef] = Field(default_factory=list)
    rejected: list[RejectedConclusion] = Field(default_factory=list)


class ConclusionSink:
    def __init__(self, session: Session) -> None:
        self.session = session

    def sink_conclusions(self, run_id: str, conclusions: list[Conclusion]) -> SinkResult:
        result = SinkResult()
        for index, conclusion in enumerate(conclusions):
            rejection = self._validate(index, conclusion)
            if rejection is not None:
                result.rejected.append(rejection)
                continue
            relation_class = self._effective_relation_class(conclusion)
            if conclusion.type is ConclusionType.EDGE:
                edge = models.Edge(
                    type=conclusion.relation_type or "influences",
                    from_entity_type=conclusion.from_entity_type or "",
                    from_entity_id=conclusion.from_entity_id or "",
                    to_entity_type=conclusion.to_entity_type or "",
                    to_entity_id=conclusion.to_entity_id or "",
                    direction=conclusion.direction or "uncertain",
                    strength=conclusion.strength or Decimal("0"),
                    confidence=conclusion.confidence or Decimal("0"),
                    relation_class=relation_class,
                    evidence=conclusion.evidence,
                    expires_hint=conclusion.expires_hint,
                )
                self.session.add(edge)
                self.session.flush()
                result.accepted.append(ConclusionRef(type=ConclusionType.EDGE, id=edge.id))
            elif conclusion.type is ConclusionType.LEADER_SCORE:
                leader_score = models.LeaderScore(
                    subject_type=conclusion.subject_type or "",
                    subject_id=conclusion.subject_id or "",
                    sector_id=conclusion.sector_id or "",
                    score_type=conclusion.score_type,
                    score=conclusion.score or Decimal("0"),
                    weight_template_version=conclusion.weight_template_version or "default",
                    baseline=conclusion.baseline,
                    relation_class=relation_class,
                    evidence=conclusion.evidence,
                    as_of=conclusion.as_of or date.today(),
                    source=conclusion.source,
                )
                self.session.add(leader_score)
                self.session.flush()
                result.accepted.append(
                    ConclusionRef(type=ConclusionType.LEADER_SCORE, id=leader_score.id)
                )
            elif conclusion.type is ConclusionType.IMPACT_SCORE:
                impact_score = models.ImpactScore(
                    subject_type=conclusion.subject_type or "",
                    subject_id=conclusion.subject_id or "",
                    event_id=conclusion.event_id or "",
                    score=conclusion.score or Decimal("0"),
                    direction=conclusion.direction or "uncertain",
                    relation_class=relation_class,
                    evidence=conclusion.evidence,
                    as_of=conclusion.as_of or date.today(),
                    source=conclusion.source,
                )
                self.session.add(impact_score)
                self.session.flush()
                result.accepted.append(
                    ConclusionRef(type=ConclusionType.IMPACT_SCORE, id=impact_score.id)
                )
        self._append_trace(
            run_id,
            "conclusion_sink",
            {
                "accepted": [item.model_dump(mode="json") for item in result.accepted],
                "rejected": [item.model_dump(mode="json") for item in result.rejected],
            },
        )
        self.session.flush()
        return result

    def revoke_conclusion(
        self,
        edge_id: str,
        reason: str,
        *,
        run_id: str | None = None,
        by_evidence_id: str | None = None,
    ) -> None:
        edge = self.session.get(models.Edge, edge_id)
        if edge is None:
            raise LookupError(f"edge {edge_id} does not exist")
        edge.revoked_at = datetime.now(UTC)
        edge.revoked_reason = reason
        edge.revoked_by = str(by_evidence_id) if by_evidence_id is not None else None
        if run_id is not None:
            self._append_trace(
                run_id,
                "revoke_conclusion",
                {"edge_id": edge_id, "reason": reason, "by_evidence_id": by_evidence_id},
            )
        self.session.flush()

    def _validate(self, index: int, conclusion: Conclusion) -> RejectedConclusion | None:
        if conclusion.relation_class is None:
            return RejectedConclusion(
                reason=RejectionReason.MISSING_RELATION_CLASS,
                index=index,
                detail="relation_class is required",
            )
        if not conclusion.evidence:
            return RejectedConclusion(
                reason=RejectionReason.MISSING_EVIDENCE,
                index=index,
                detail="evidence is required",
            )
        if conclusion.type is ConclusionType.EDGE and not self._known_edge_subjects(conclusion):
            return RejectedConclusion(
                reason=RejectionReason.UNKNOWN_SUBJECT,
                index=index,
                detail="edge endpoint is unknown",
            )
        if conclusion.type in {
            ConclusionType.LEADER_SCORE,
            ConclusionType.IMPACT_SCORE,
        } and not self._known_subject(conclusion.subject_type, conclusion.subject_id):
            return RejectedConclusion(
                reason=RejectionReason.UNKNOWN_SUBJECT,
                index=index,
                detail="score subject is unknown",
            )
        if not self._all_evidence_exists(conclusion.evidence):
            return RejectedConclusion(
                reason=RejectionReason.MISSING_EVIDENCE,
                index=index,
                detail="evidence must reference existing Evidence rows",
            )
        return None

    def _effective_relation_class(self, conclusion: Conclusion) -> str:
        if conclusion.source_kind == "llm":
            return "inferred"
        return conclusion.relation_class or "inferred"

    def _all_evidence_exists(self, evidence_ids: list[str]) -> bool:
        existing_count = self.session.scalar(
            select(func.count(models.Evidence.id)).where(models.Evidence.id.in_(evidence_ids))
        )
        return existing_count == len(set(evidence_ids))

    def _known_edge_subjects(self, conclusion: Conclusion) -> bool:
        return self._known_subject(
            conclusion.from_entity_type, conclusion.from_entity_id
        ) and self._known_subject(
            conclusion.to_entity_type,
            conclusion.to_entity_id,
        )

    def _known_subject(self, entity_type: str | None, entity_id: str | None) -> bool:
        if not entity_type or not entity_id:
            return False
        match entity_type:
            case "stock" | "symbol":
                return (
                    self.session.scalar(
                        select(models.Stock).where(
                            or_(models.Stock.id == entity_id, models.Stock.symbol == entity_id),
                        )
                    )
                    is not None
                )
            case "company":
                return (
                    self.session.scalar(
                        select(models.Company).where(
                            or_(models.Company.id == entity_id, models.Company.name == entity_id),
                        )
                    )
                    is not None
                )
            case "product":
                return self.session.get(models.Product, entity_id) is not None
            case "commodity":
                return self.session.get(models.Commodity, entity_id) is not None
            case "market_variable":
                return self.session.get(models.MarketVariable, entity_id) is not None
            case "market_event" | "event":
                return self.session.get(models.MarketEvent, entity_id) is not None
            case "sector":
                return self.session.get(models.SectorCanonical, entity_id) is not None
            case _:
                return False

    def _append_trace(self, run_id: str, kind: str, payload: dict[str, object]) -> None:
        max_idx = self.session.scalar(
            select(func.max(models.TraceEvent.idx)).where(models.TraceEvent.run_id == run_id)
        )
        self.session.add(
            models.TraceEvent(
                run_id=run_id,
                idx=0 if max_idx is None else max_idx + 1,
                kind=kind,
                payload=payload,
            )
        )
