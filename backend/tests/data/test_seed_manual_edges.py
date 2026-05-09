from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data import models
from scripts.seed_manual_edges import load_manual_edge_seeds, seed_manual_edges


def test_seed_manual_edges_is_idempotent(session: Session) -> None:
    observed_at = datetime(2026, 5, 8, tzinfo=UTC)

    first = seed_manual_edges(session, observed_at=observed_at)
    second = seed_manual_edges(session, observed_at=observed_at)

    assert first.inserted_edges == 8
    assert second.inserted_edges == 0
    edges = session.scalars(select(models.Edge)).all()
    evidence = session.scalars(
        select(models.Evidence).where(models.Evidence.type == "manual")
    ).all()

    assert len(edges) == 8
    assert len(evidence) == 8
    assert {edge.relation_class for edge in edges} == {"fact"}
    assert all(edge.evidence for edge in edges)
    assert {"SOX", "DGS10"}.issubset({edge.from_entity_id for edge in edges})
    assert {"BK_SEMICONDUCTOR", "BK_BANK"}.issubset({edge.to_entity_id for edge in edges})


def test_manual_edges_can_be_loaded_from_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "manual_edges.csv"
    csv_path.write_text(
        "\n".join(
            [
                "from_entity_type,from_entity_id,from_name,from_company,from_exchange,"
                "to_entity_type,to_entity_id,to_name,to_company,to_exchange,relation_type,"
                "direction,strength,confidence,title",
                "stock,NVDA,NVIDIA,NVIDIA Corporation,NASDAQ,sector,BK_AI_COMPUTE,"
                "AI算力,,,influences,positive,0.80,0.70,NVDA maps to AI compute",
            ]
        ),
        encoding="utf-8",
    )

    seeds = load_manual_edge_seeds(csv_path)

    assert len(seeds) == 1
    assert seeds[0].from_entity_id == "NVDA"
    assert seeds[0].to_entity_id == "BK_AI_COMPUTE"
