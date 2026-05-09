from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data import models
from app.data.repositories import (
    CommodityRepository,
    CompanyRepository,
    MarketEventRepository,
    MarketVariableRepository,
    ProductRepository,
    StockRepository,
)
from app.domain.conclusion_sink import (
    Conclusion,
    ConclusionSink,
    ConclusionType,
    RejectionReason,
)
from app.domain.evidence import EvidenceService, EvidenceValidationError


def test_evidence_service_rejects_missing_observed_at(session: Session) -> None:
    service = EvidenceService(session)

    with pytest.raises(EvidenceValidationError):
        service.record(
            type="manual",
            source="test",
            payload={"hash": "sha256:missing-observed-at"},
        )


def test_evidence_service_is_idempotent_by_hash(session: Session) -> None:
    service = EvidenceService(session)
    payload = {
        "hash": "sha256:manual-note",
        "title": "Manual note",
        "observed_at": datetime(2026, 5, 8, tzinfo=UTC),
        "extra": {"manual": {"operator": "tester"}},
    }

    first_id = service.record(type="manual", source="seed", payload=payload)
    second_id = service.record(type="manual", source="seed", payload=payload)

    assert first_id == second_id
    assert session.scalar(select(models.Evidence).where(models.Evidence.hash == payload["hash"]))


def test_repository_upsert_get_find_and_attach_evidence(session: Session) -> None:
    evidence_id = EvidenceService(session).record(
        type="manual",
        source="test",
        payload={
            "hash": "sha256:repo",
            "observed_at": datetime(2026, 5, 8, tzinfo=UTC),
        },
    )
    repository = StockRepository(session)

    stock = repository.upsert(
        symbol="NVDA",
        exchange="NASDAQ",
        name="NVIDIA",
        company_name="NVIDIA Corporation",
        currency="USD",
    )
    same_stock = repository.upsert(
        symbol="NVDA",
        exchange="NASDAQ",
        name="NVIDIA Corp",
        company_name="NVIDIA Corporation",
        currency="USD",
    )
    repository.attach_evidence(same_stock.id, evidence_id)
    session.commit()

    assert stock.id == same_stock.id
    assert repository.get_by_id(stock.id) is same_stock
    assert repository.find(symbol="NVDA") == [same_stock]
    assert str(evidence_id) in same_stock.evidence


def test_entity_repositories_upsert_and_attach_evidence(session: Session) -> None:
    evidence_id = EvidenceService(session).record(
        type="manual",
        source="test",
        payload={
            "hash": "sha256:entity-repo",
            "observed_at": datetime(2026, 5, 8, tzinfo=UTC),
        },
    )

    company = CompanyRepository(session).upsert(name="Apple Inc.", country="US")
    product = ProductRepository(session).upsert(
        id="product_iphone",
        name="iPhone",
        category="consumer_electronics",
    )
    commodity = CommodityRepository(session).upsert(
        id="commodity_lithium",
        name="Lithium",
        unit="ton",
        currency="USD",
    )
    variable = MarketVariableRepository(session).upsert(
        id="fred_DGS10",
        name="10-Year Treasury Constant Maturity Rate",
        source="fred",
        unit="percent",
    )
    event = MarketEventRepository(session).upsert(
        id="event_nvda_earnings",
        title="NVIDIA earnings",
        occurred_at=datetime(2026, 5, 8, tzinfo=UTC),
        source="manual",
    )

    CompanyRepository(session).attach_evidence(company.id, evidence_id)
    ProductRepository(session).attach_evidence(product.id, evidence_id)
    CommodityRepository(session).attach_evidence(commodity.id, evidence_id)
    MarketVariableRepository(session).attach_evidence(variable.id, evidence_id)
    MarketEventRepository(session).attach_evidence(event.id, evidence_id)

    session.commit()

    evidence_links = session.scalars(select(models.EvidenceLink)).all()
    assert len(evidence_links) == 5


def test_conclusion_sink_rejects_missing_evidence_relation_class_and_unknown_subject(
    session: Session,
) -> None:
    sink = ConclusionSink(session)
    run = models.Run(skill="test_skill", trigger_source="test", status="running")
    session.add(run)
    session.commit()

    result = sink.sink_conclusions(
        run.id,
        [
            Conclusion(
                type=ConclusionType.EDGE,
                relation_type="influences",
                from_entity_type="stock",
                from_entity_id="NVDA",
                to_entity_type="stock",
                to_entity_id="300308.SZ",
                direction="positive",
                strength=Decimal("0.6"),
                confidence=Decimal("0.7"),
                relation_class="fact",
                evidence=[],
            ),
            Conclusion(
                type=ConclusionType.EDGE,
                relation_type="influences",
                from_entity_type="stock",
                from_entity_id="NVDA",
                to_entity_type="stock",
                to_entity_id="300308.SZ",
                direction="positive",
                strength=Decimal("0.6"),
                confidence=Decimal("0.7"),
                evidence=["missing"],
            ),
            Conclusion(
                type=ConclusionType.EDGE,
                relation_type="influences",
                from_entity_type="stock",
                from_entity_id="UNKNOWN",
                to_entity_type="stock",
                to_entity_id="300308.SZ",
                direction="positive",
                strength=Decimal("0.6"),
                confidence=Decimal("0.7"),
                relation_class="fact",
                evidence=["missing"],
            ),
        ],
    )

    assert [item.reason for item in result.rejected] == [
        RejectionReason.MISSING_EVIDENCE,
        RejectionReason.MISSING_RELATION_CLASS,
        RejectionReason.UNKNOWN_SUBJECT,
    ]
    assert result.accepted == []
    assert (
        session.scalar(select(models.TraceEvent).where(models.TraceEvent.run_id == run.id))
        is not None
    )


def test_conclusion_sink_forces_llm_outputs_to_inferred_and_revoke_hides_active_edge(
    session: Session,
) -> None:
    evidence_id = EvidenceService(session).record(
        type="llm",
        source="openai",
        payload={
            "hash": "sha256:llm-conclusion",
            "observed_at": datetime(2026, 5, 8, tzinfo=UTC),
            "extra": {"llm": {"model": "gpt-4.1"}},
        },
    )
    run = models.Run(skill="test_skill", trigger_source="test", status="running")
    session.add_all(
        [
            run,
            models.Company(name="NVIDIA Corporation", country="US"),
            models.Company(name="Zhongji Innolight", country="CN"),
        ],
    )
    session.flush()
    companies = session.scalars(select(models.Company).order_by(models.Company.name)).all()
    session.add_all(
        [
            models.Stock(
                symbol="NVDA",
                exchange="NASDAQ",
                name="NVIDIA",
                company_id=companies[0].id,
            ),
            models.Stock(
                symbol="300308.SZ",
                exchange="SZSE",
                name="中际旭创",
                company_id=companies[1].id,
            ),
        ],
    )
    session.commit()

    sink = ConclusionSink(session)
    result = sink.sink_conclusions(
        run.id,
        [
            Conclusion(
                type=ConclusionType.EDGE,
                relation_type="influences",
                from_entity_type="stock",
                from_entity_id="NVDA",
                to_entity_type="stock",
                to_entity_id="300308.SZ",
                direction="positive",
                strength=Decimal("0.70"),
                confidence=Decimal("0.80"),
                relation_class="fact",
                evidence=[str(evidence_id)],
                source_kind="llm",
            ),
        ],
    )

    assert len(result.accepted) == 1
    edge = session.get(models.Edge, result.accepted[0].id)
    assert edge is not None
    assert edge.relation_class == "inferred"

    sink.revoke_conclusion(edge.id, "bad inference", run_id=run.id, by_evidence_id=evidence_id)
    session.commit()

    assert session.scalar(select(models.ActiveEdge).where(models.ActiveEdge.id == edge.id)) is None
    historical_edge = session.get(models.Edge, edge.id)
    assert historical_edge is not None
    assert historical_edge.revoked_reason == "bad inference"


def test_conclusion_sink_accepts_leader_score(session: Session) -> None:
    evidence_id = EvidenceService(session).record(
        type="stat",
        source="manual",
        payload={
            "hash": "sha256:leader-score",
            "observed_at": datetime(2026, 5, 8, tzinfo=UTC),
            "extra": {"stat": {"sample_size": 3}},
        },
    )
    run = models.Run(skill="leader_identification", trigger_source="test", status="running")
    company = models.Company(name="Zhongji Innolight", country="CN")
    stock = models.Stock(symbol="300308.SZ", exchange="SZSE", name="中际旭创", company=company)
    sector = models.SectorCanonical(id="BK_CPO", name="光模块", type="concept")
    session.add_all([run, stock, sector])
    session.commit()

    result = ConclusionSink(session).sink_conclusions(
        run.id,
        [
            Conclusion(
                type=ConclusionType.LEADER_SCORE,
                subject_type="stock",
                subject_id="300308.SZ",
                sector_id="BK_CPO",
                score=Decimal("0.86"),
                score_type="leader",
                weight_template_version="default@2026-05-08",
                baseline=True,
                relation_class="statistical",
                evidence=[str(evidence_id)],
                as_of=date(2026, 5, 8),
                source="manual",
            ),
        ],
    )

    assert len(result.accepted) == 1
    assert result.rejected == []
    score = session.get(models.LeaderScore, result.accepted[0].id)
    assert score is not None
    assert score.weight_template_version == "default@2026-05-08"


def test_conclusion_sink_accepts_non_stock_edges_and_rejects_unknown_scores(
    session: Session,
) -> None:
    evidence_id = EvidenceService(session).record(
        type="manual",
        source="test",
        payload={
            "hash": "sha256:non-stock-edge",
            "observed_at": datetime(2026, 5, 8, tzinfo=UTC),
        },
    )
    run = models.Run(skill="supply_chain", trigger_source="test", status="running")
    session.add_all(
        [
            run,
            models.Product(id="product_gpu", name="GPU"),
            models.SectorCanonical(id="BK_CPO", name="光模块", type="concept"),
        ]
    )
    session.commit()

    result = ConclusionSink(session).sink_conclusions(
        run.id,
        [
            Conclusion(
                type=ConclusionType.EDGE,
                relation_type="drives_demand",
                from_entity_type="product",
                from_entity_id="product_gpu",
                to_entity_type="sector",
                to_entity_id="BK_CPO",
                direction="positive",
                strength=Decimal("0.70"),
                confidence=Decimal("0.80"),
                relation_class="fact",
                evidence=[str(evidence_id)],
            ),
            Conclusion(
                type=ConclusionType.LEADER_SCORE,
                subject_type="stock",
                subject_id="UNKNOWN",
                sector_id="BK_CPO",
                score=Decimal("0.86"),
                relation_class="statistical",
                evidence=[str(evidence_id)],
                as_of=date(2026, 5, 8),
            ),
        ],
    )

    assert [item.type for item in result.accepted] == [ConclusionType.EDGE]
    assert [item.reason for item in result.rejected] == [RejectionReason.UNKNOWN_SUBJECT]
