from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.models import Evidence


class EvidenceValidationError(ValueError):
    pass


class EvidenceService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record(self, *, type: str, source: str, payload: dict[str, Any]) -> str:
        observed_at = payload.get("observed_at")
        content_hash = payload.get("hash")
        if observed_at is None:
            raise EvidenceValidationError("observed_at is required")
        if content_hash is None:
            raise EvidenceValidationError("hash is required")
        if not isinstance(observed_at, datetime):
            raise EvidenceValidationError("observed_at must be a datetime")

        existing = self.session.scalar(select(Evidence).where(Evidence.hash == content_hash))
        if existing is not None:
            return existing.id

        evidence = Evidence(
            type=type,
            source=source,
            url_or_path=payload.get("url_or_path"),
            title=payload.get("title"),
            excerpt=payload.get("excerpt"),
            observed_at=observed_at,
            hash=content_hash,
            lang=payload.get("lang"),
            extra=payload.get("extra", {}),
        )
        self.session.add(evidence)
        self.session.flush()
        return evidence.id
