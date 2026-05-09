from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import exc, select
from sqlalchemy.orm import Session

from app.data import models


def test_entity_tables_accept_minimal_rows(session: Session) -> None:
    company = models.Company(name="NVIDIA Corporation", country="US")
    stock = models.Stock(
        symbol="NVDA",
        exchange="NASDAQ",
        name="NVIDIA",
        company=company,
        currency="USD",
    )
    product = models.Product(id="product_gpu", name="GPU")
    commodity = models.Commodity(id="commodity_copper", name="Copper")
    market_variable = models.MarketVariable(
        id="fred_DGS10",
        name="10-Year Treasury Constant Maturity Rate",
        source="fred",
        unit="percent",
    )
    market_event = models.MarketEvent(
        id="event_ai_capex",
        title="AI capex cycle",
        occurred_at=datetime(2026, 5, 8, tzinfo=UTC),
        source="manual",
    )

    session.add_all([stock, product, commodity, market_variable, market_event])
    session.commit()

    assert session.scalar(select(models.Stock).where(models.Stock.symbol == "NVDA")) is stock
    assert (
        session.scalar(select(models.Product).where(models.Product.id == "product_gpu")) is product
    )
    assert session.scalar(select(models.Commodity).where(models.Commodity.id == "commodity_copper"))
    assert session.scalar(
        select(models.MarketVariable).where(models.MarketVariable.id == "fred_DGS10")
    )
    assert session.scalar(
        select(models.MarketEvent).where(models.MarketEvent.id == "event_ai_capex")
    )


def test_sector_membership_marks_default_single_source_as_eligible(session: Session) -> None:
    company = models.Company(name="Zhongji Innolight", country="CN")
    stock = models.Stock(symbol="300308.SZ", exchange="SZSE", name="中际旭创", company=company)
    sector = models.SectorCanonical(id="BK_CPO", name="光模块", type="concept")
    provider = models.SectorProvider(
        provider="eastmoney",
        provider_code="BK0420",
        provider_name="CPO",
    )
    mapping = models.SectorMapping(
        provider_sector=provider,
        canonical_sector=sector,
        relevance=Decimal("0.70"),
        as_of=date(2026, 5, 8),
        evidence=["manual-default"],
    )
    membership = models.SectorMembership(
        stock=stock,
        sector=sector,
        relevance=Decimal("0.70"),
        confidence=Decimal("0.80"),
        as_of=date(2026, 5, 8),
    )

    session.add_all([mapping, membership])
    session.commit()

    assert membership.eligible is True


def test_sector_membership_below_threshold_is_kept_but_ineligible(session: Session) -> None:
    company = models.Company(name="Weak Theme Co", country="CN")
    stock = models.Stock(symbol="000001.SZ", exchange="SZSE", name="弱相关", company=company)
    sector = models.SectorCanonical(id="BK_AICHIP", name="AI 芯片", type="concept")
    membership = models.SectorMembership(
        stock=stock,
        sector=sector,
        relevance=Decimal("0.40"),
        confidence=Decimal("0.80"),
        as_of=date(2026, 5, 8),
    )

    session.add(membership)
    session.commit()

    assert membership.eligible is False


def test_evidence_extra_accepts_stat_and_llm_payloads(session: Session) -> None:
    stat = models.Evidence(
        type="stat",
        source="akshare",
        title="market stat",
        observed_at=datetime(2026, 5, 8, tzinfo=UTC),
        hash="sha256:stat",
        extra={"stat": {"metric_id": "market_metric_1", "sample_size": 5}},
    )
    llm = models.Evidence(
        type="llm",
        source="openai",
        title="model extraction",
        observed_at=datetime(2026, 5, 8, tzinfo=UTC),
        hash="sha256:llm",
        extra={"llm": {"model": "gpt-4.1", "prompt_hash": "sha256:prompt"}},
    )

    session.add_all([stat, llm])
    session.commit()

    assert (
        session.scalar(select(models.Evidence).where(models.Evidence.hash == "sha256:stat")) is stat
    )
    assert (
        session.scalar(select(models.Evidence).where(models.Evidence.hash == "sha256:llm")) is llm
    )


def test_edge_rejects_missing_relation_class(session: Session) -> None:
    evidence = models.Evidence(
        type="manual",
        source="seed",
        observed_at=datetime(2026, 5, 8, tzinfo=UTC),
        hash="sha256:edge",
    )
    edge = models.Edge(
        type="influences",
        from_entity_type="stock",
        from_entity_id="NVDA",
        to_entity_type="stock",
        to_entity_id="300308.SZ",
        direction="positive",
        strength=Decimal("0.70"),
        confidence=Decimal("0.80"),
        relation_class=None,
        evidence=[str(evidence.id)],
    )

    session.add_all([evidence, edge])

    with pytest.raises((exc.IntegrityError, exc.StatementError)):
        session.commit()


def test_metric_tables_accept_required_as_of_and_source(session: Session) -> None:
    financial_metric = models.FinancialMetric(
        subject_type="stock",
        subject_id="NVDA",
        metric_name="revenue",
        value=Decimal("60900000000"),
        currency="USD",
        as_of=date(2026, 1, 31),
        source="yfinance",
    )
    market_metric = models.MarketMetric(
        subject_type="stock",
        subject_id="NVDA",
        metric_name="close",
        value=Decimal("900"),
        currency="USD",
        as_of=date(2026, 5, 8),
        source="yfinance",
    )
    sector_metric = models.SectorMetric(
        sector_id="BK_CPO",
        metric_name="heat",
        value=Decimal("0.81"),
        as_of=date(2026, 5, 8),
        source="manual",
    )
    leader_score = models.LeaderScore(
        subject_type="stock",
        subject_id="300308.SZ",
        sector_id="BK_CPO",
        score_type="leader",
        score=Decimal("0.86"),
        weight_template_version="default@2026-05-08",
        baseline=True,
        relation_class="statistical",
        evidence=["manual"],
        as_of=date(2026, 5, 8),
        source="manual",
    )
    impact_score = models.ImpactScore(
        subject_type="stock",
        subject_id="300308.SZ",
        event_id="event_ai_capex",
        score=Decimal("0.65"),
        direction="positive",
        relation_class="statistical",
        evidence=["manual"],
        as_of=date(2026, 5, 8),
        source="manual",
    )

    session.add_all([financial_metric, market_metric, sector_metric, leader_score, impact_score])
    session.commit()

    assert session.scalar(select(models.LeaderScore).where(models.LeaderScore.baseline.is_(True)))
    assert session.scalar(
        select(models.ImpactScore).where(models.ImpactScore.event_id == "event_ai_capex")
    )


def test_runtime_and_conversation_tables_link_runs_artifacts_and_references(
    session: Session,
) -> None:
    run = models.Run(skill="mock_skill", trigger_source="test", status="succeeded")
    trace_event = models.TraceEvent(run=run, idx=0, kind="tool", payload={"ok": True})
    artifact = models.RunArtifact(
        run=run, artifact_path="/runs/2026-05-08/mock_skill/x/artifact.json"
    )
    thread = models.ConversationThread(
        title="AI supply chain", subject_ref={"type": "stock", "id": "NVDA"}
    )
    reference = models.ConversationReference(thread=thread, run=run, message_idx=1)

    session.add_all([trace_event, artifact, reference])
    session.commit()

    assert artifact.run_id == run.id
    assert (
        session.scalars(
            select(models.ConversationThread)
            .join(models.ConversationReference)
            .where(models.ConversationReference.run_id == run.id)
        ).one()
        is thread
    )

    thread.archive()
    session.commit()

    assert thread.archived_at is not None


def test_alert_record_table_persists_gate_states(session: Session) -> None:
    record = models.AlertRecord(
        rule_id="leader_score_change",
        alert_type="leader_score_change",
        subject_type="sector",
        subject_id="BK_CPO",
        subject_name="光模块",
        priority="high",
        state="sent",
        title="光模块综合分变化",
        summary="中际旭创继续领跑。",
        evidence=["ev_metric_001"],
        artifact_run_id="run-leader-BK_CPO",
        open_chat_thread_id="thread-bk-cpo",
        channels={"in_app": {"accepted": True}},
        ctx={"delta": 0.06},
        follow_up={"window": "next_3_sessions"},
        created_at=datetime(2026, 5, 8, 10, 0, tzinfo=UTC),
        sent_at=datetime(2026, 5, 8, 10, 1, tzinfo=UTC),
    )

    session.add(record)
    session.commit()

    stored = session.scalar(
        select(models.AlertRecord).where(models.AlertRecord.rule_id == "leader_score_change")
    )
    assert stored is record
    assert stored.state == "sent"
    assert stored.channels["in_app"]["accepted"] is True
