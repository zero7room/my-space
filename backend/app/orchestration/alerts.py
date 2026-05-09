from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from enum import StrEnum
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from app.data import models


class AlertPriority(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SubjectRef(BaseModel):
    type: str
    id: str
    name: str | None = None


class AlertCandidate(BaseModel):
    rule_id: str
    alert_type: str = "strategy"
    subject: SubjectRef
    priority: AlertPriority
    title: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    artifact_run_id: str | None = None
    open_chat: bool = False
    ctx: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class AlertRecord(BaseModel):
    alert_id: UUID = Field(default_factory=uuid4)
    rule_id: str
    alert_type: str
    subject: SubjectRef
    priority: AlertPriority
    title: str
    summary: str
    evidence: list[str] = Field(default_factory=list)
    artifact_run_id: str | None = None
    open_chat_thread_id: str | None = None
    parent_alert_id: UUID | None = None
    channels: dict[str, object] = Field(default_factory=dict)
    state: str
    reason: str | None = None
    ctx: dict[str, object] = Field(default_factory=dict)
    follow_up: dict[str, object] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    sent_at: datetime | None = None

    def to_db_model(self) -> models.AlertRecord:
        return models.AlertRecord(
            alert_id=str(self.alert_id),
            rule_id=self.rule_id,
            alert_type=self.alert_type,
            subject_type=self.subject.type,
            subject_id=self.subject.id,
            subject_name=self.subject.name,
            priority=self.priority.value,
            state=self.state,
            title=self.title,
            summary=self.summary,
            evidence=self.evidence,
            artifact_run_id=self.artifact_run_id,
            open_chat_thread_id=self.open_chat_thread_id,
            parent_alert_id=str(self.parent_alert_id) if self.parent_alert_id else None,
            channels=self.channels,
            ctx=self.ctx,
            follow_up=self.follow_up,
            reason=self.reason,
            created_at=self.created_at,
            sent_at=self.sent_at,
        )


class AlertStore:
    def __init__(self) -> None:
        self._records: list[AlertRecord] = []

    def add(self, record: AlertRecord) -> AlertRecord:
        self._records.append(record)
        return record

    def list_records(self) -> list[AlertRecord]:
        return sorted(self._records, key=lambda item: item.created_at, reverse=True)

    def recent(
        self,
        *,
        subject: SubjectRef,
        alert_type: str,
        since: datetime,
    ) -> list[AlertRecord]:
        return [
            record
            for record in self._records
            if record.subject.type == subject.type
            and record.subject.id == subject.id
            and record.alert_type == alert_type
            and record.created_at >= since
        ]

    def same_subject_since(self, *, subject: SubjectRef, since: datetime) -> list[AlertRecord]:
        return [
            record
            for record in self._records
            if record.subject.type == subject.type
            and record.subject.id == subject.id
            and record.created_at >= since
        ]

    def sent_count(self, *, priority: AlertPriority, day: date) -> int:
        return sum(
            1
            for record in self._records
            if record.priority == priority
            and record.state == "sent"
            and record.created_at.date() == day
        )

    def daily_fallback(self, day: date) -> list[AlertRecord]:
        fallback_states = {"capped", "deferred", "suppressed"}
        return [
            record
            for record in self.list_records()
            if record.created_at.date() == day and record.state in fallback_states
        ]


class AlertGate:
    def __init__(
        self,
        *,
        store: AlertStore,
        now: Callable[[], datetime] | None = None,
        daily_caps: dict[AlertPriority, int] | None = None,
        merge_threshold: int = 3,
    ) -> None:
        self.store = store
        self.now = now or (lambda: datetime.now(UTC))
        self.daily_caps = daily_caps or {
            AlertPriority.HIGH: 20,
            AlertPriority.MEDIUM: 10,
            AlertPriority.LOW: 5,
        }
        self.merge_threshold = merge_threshold

    def process(self, candidate: AlertCandidate) -> AlertRecord:
        current = self.now()
        record = self._record(candidate)

        if self._is_duplicate(candidate, current):
            record.state = "suppressed"
            record.reason = "deduplicated_30m"
            return self.store.add(record)

        if self._is_quiet_time(current):
            if candidate.priority == AlertPriority.LOW:
                record.state = "suppressed"
                record.reason = "quiet_hours_low_priority"
            else:
                record.state = "deferred"
                record.reason = "quiet_hours"
            return self.store.add(record)

        if self._is_capped(candidate.priority, current):
            record.state = "capped"
            record.reason = "daily_cap"
            return self.store.add(record)

        if self._should_merge(candidate, current):
            record.state = "merged"
            record.reason = "subject_summary_1h"
            return self.store.add(record)

        record.state = "sent"
        record.reason = "delivered"
        record.sent_at = current
        record.channels = {"in_app": {"accepted": True}}
        return self.store.add(record)

    def _is_duplicate(self, candidate: AlertCandidate, current: datetime) -> bool:
        since = current - timedelta(minutes=30)
        return any(
            record.rule_id == candidate.rule_id
            for record in self.store.recent(
                subject=candidate.subject,
                alert_type=candidate.alert_type,
                since=since,
            )
        )

    def _should_merge(self, candidate: AlertCandidate, current: datetime) -> bool:
        since = current - timedelta(hours=1)
        existing = self.store.same_subject_since(subject=candidate.subject, since=since)
        reaches_threshold = len(existing) + 1 >= self.merge_threshold
        return reaches_threshold and candidate.priority != AlertPriority.HIGH

    def _is_capped(self, priority: AlertPriority, current: datetime) -> bool:
        sent_count = self.store.sent_count(priority=priority, day=current.date())
        return sent_count >= self.daily_caps[priority]

    @staticmethod
    def _is_quiet_time(current: datetime) -> bool:
        local_time = current.time()
        return local_time >= time(21, 30) or local_time < time(8, 30)

    @staticmethod
    def _record(candidate: AlertCandidate) -> AlertRecord:
        return AlertRecord(
            rule_id=candidate.rule_id,
            alert_type=candidate.alert_type,
            subject=candidate.subject,
            priority=candidate.priority,
            title=candidate.title,
            summary=candidate.summary,
            evidence=candidate.evidence,
            artifact_run_id=candidate.artifact_run_id,
            open_chat_thread_id=(
                f"thread_{candidate.subject.id.lower().removeprefix('bk_')}"
                if candidate.open_chat
                else None
            ),
            state="pending",
            ctx=candidate.ctx,
            follow_up={
                "window": "next_3_sessions",
                "fields": ["return_pct", "volume_ratio", "leader_score_delta"],
            },
            created_at=candidate.created_at,
        )


def seeded_alert_store() -> AlertStore:
    store = AlertStore()
    gate = AlertGate(store=store, now=lambda: datetime(2026, 5, 8, 10, 0, tzinfo=UTC))
    gate.process(
        AlertCandidate(
            rule_id="leader_score_change",
            alert_type="leader_score_change",
            subject=SubjectRef(type="sector", id="BK_CPO", name="光模块"),
            priority=AlertPriority.HIGH,
            title="光模块综合分变动 +0.04",
            summary="中际旭创继续领跑, 新易盛紧随其后。",
            evidence=["ev_metric_001"],
            artifact_run_id="run_cpo_leader_20260508",
            open_chat=True,
            ctx={"delta": 0.06, "weight_template_version": "tech-v1"},
        )
    )
    return store
