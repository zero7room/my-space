import csv
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.database import SessionLocal
from app.data.models import Company, Edge, Evidence, MarketVariable, SectorCanonical, Stock


@dataclass(frozen=True)
class ManualEdgeSeed:
    from_entity_type: str
    from_entity_id: str
    from_name: str
    from_company: str
    from_exchange: str
    to_entity_type: str
    to_entity_id: str
    to_name: str
    to_company: str
    to_exchange: str
    relation_type: str
    direction: str
    strength: Decimal
    confidence: Decimal
    title: str


@dataclass(frozen=True)
class SeedResult:
    inserted_edges: int
    inserted_evidence: int


MANUAL_EDGES = [
    ManualEdgeSeed(
        "stock",
        "NVDA",
        "NVIDIA",
        "NVIDIA Corporation",
        "NASDAQ",
        "sector",
        "BK_CPO",
        "光模块",
        "",
        "",
        "influences",
        "positive",
        Decimal("0.85"),
        Decimal("0.78"),
        "NVDA AI capex influences optical module sector demand",
    ),
    ManualEdgeSeed(
        "sector",
        "BK_CPO",
        "光模块",
        "",
        "",
        "stock",
        "300308.SZ",
        "中际旭创",
        "Zhongji Innolight",
        "SZSE",
        "influences",
        "positive",
        Decimal("0.80"),
        Decimal("0.70"),
        "NVDA AI capex influences Zhongji Innolight optical demand",
    ),
    ManualEdgeSeed(
        "stock",
        "TSLA",
        "Tesla",
        "Tesla Inc.",
        "NASDAQ",
        "sector",
        "BK_LITHIUM_BATTERY",
        "锂电池",
        "",
        "",
        "influences",
        "positive",
        Decimal("0.65"),
        Decimal("0.65"),
        "TSLA EV demand influences CATL battery chain expectations",
    ),
    ManualEdgeSeed(
        "stock",
        "AAPL",
        "Apple",
        "Apple Inc.",
        "NASDAQ",
        "sector",
        "BK_CONSUMER_ELECTRONICS",
        "消费电子",
        "",
        "",
        "influences",
        "positive",
        Decimal("0.70"),
        Decimal("0.70"),
        "AAPL hardware cycle influences Luxshare assembly chain expectations",
    ),
    ManualEdgeSeed(
        "market_variable",
        "SOX",
        "Philadelphia Semiconductor Index",
        "",
        "",
        "sector",
        "BK_SEMICONDUCTOR",
        "半导体",
        "",
        "",
        "influences",
        "positive",
        Decimal("0.62"),
        Decimal("0.66"),
        "SOX maps to semiconductor equipment/materials/design/packaging sentiment",
    ),
    ManualEdgeSeed(
        "market_variable",
        "DGS10",
        "US 10Y Treasury Yield",
        "",
        "",
        "sector",
        "BK_GROWTH_STOCKS",
        "高估值成长股",
        "",
        "",
        "influences",
        "negative",
        Decimal("0.58"),
        Decimal("0.64"),
        "US rates pressure high-valuation growth stocks",
    ),
    ManualEdgeSeed(
        "market_variable",
        "DGS10",
        "US 10Y Treasury Yield",
        "",
        "",
        "sector",
        "BK_GOLD",
        "黄金",
        "",
        "",
        "influences",
        "negative",
        Decimal("0.52"),
        Decimal("0.60"),
        "US rates influence gold opportunity cost",
    ),
    ManualEdgeSeed(
        "market_variable",
        "DGS10",
        "US 10Y Treasury Yield",
        "",
        "",
        "sector",
        "BK_BANK",
        "银行",
        "",
        "",
        "influences",
        "positive",
        Decimal("0.55"),
        Decimal("0.60"),
        "US rates influence bank net interest margin expectations",
    ),
]


def seed_manual_edges(
    session: Session,
    *,
    observed_at: datetime | None = None,
    csv_path: Path | None = None,
) -> SeedResult:
    observed = observed_at or datetime.now(UTC)
    inserted_edges = 0
    inserted_evidence = 0
    for seed in load_manual_edge_seeds(csv_path):
        _ensure_entity(session, seed, side="from")
        _ensure_entity(session, seed, side="to")
        evidence_hash = (
            f"sha256:manual-edge:{seed.from_entity_type}:{seed.from_entity_id}:"
            f"{seed.to_entity_type}:{seed.to_entity_id}:{seed.relation_type}"
        )
        evidence = session.scalar(select(Evidence).where(Evidence.hash == evidence_hash))
        if evidence is None:
            evidence = Evidence(
                type="manual",
                source="seed_manual_edges",
                title=seed.title,
                observed_at=observed,
                hash=evidence_hash,
                extra={
                    "manual": {
                        "from_entity_type": seed.from_entity_type,
                        "from_entity_id": seed.from_entity_id,
                        "to_entity_type": seed.to_entity_type,
                        "to_entity_id": seed.to_entity_id,
                        "relation_type": seed.relation_type,
                    }
                },
            )
            session.add(evidence)
            session.flush()
            inserted_evidence += 1

        existing_edge = session.scalar(
            select(Edge).where(
                Edge.type == seed.relation_type,
                Edge.from_entity_type == seed.from_entity_type,
                Edge.from_entity_id == seed.from_entity_id,
                Edge.to_entity_type == seed.to_entity_type,
                Edge.to_entity_id == seed.to_entity_id,
                Edge.relation_class == "fact",
                Edge.revoked_at.is_(None),
            )
        )
        if existing_edge is None:
            session.add(
                Edge(
                    type=seed.relation_type,
                    from_entity_type=seed.from_entity_type,
                    from_entity_id=seed.from_entity_id,
                    to_entity_type=seed.to_entity_type,
                    to_entity_id=seed.to_entity_id,
                    direction=seed.direction,
                    strength=seed.strength,
                    confidence=seed.confidence,
                    relation_class="fact",
                    evidence=[evidence.id],
                    extra={"seed": "M1-T15"},
                )
            )
            inserted_edges += 1
    session.commit()
    return SeedResult(inserted_edges=inserted_edges, inserted_evidence=inserted_evidence)


def load_manual_edge_seeds(csv_path: Path | None = None) -> list[ManualEdgeSeed]:
    if csv_path is None:
        return list(MANUAL_EDGES)
    with csv_path.open(newline="", encoding="utf-8") as handle:
        rows = csv.DictReader(handle)
        return [
            ManualEdgeSeed(
                from_entity_type=row["from_entity_type"],
                from_entity_id=row["from_entity_id"],
                from_name=row.get("from_name", ""),
                from_company=row.get("from_company", ""),
                from_exchange=row.get("from_exchange", ""),
                to_entity_type=row["to_entity_type"],
                to_entity_id=row["to_entity_id"],
                to_name=row.get("to_name", ""),
                to_company=row.get("to_company", ""),
                to_exchange=row.get("to_exchange", ""),
                relation_type=row["relation_type"],
                direction=row["direction"],
                strength=Decimal(row["strength"]),
                confidence=Decimal(row["confidence"]),
                title=row["title"],
            )
            for row in rows
        ]


def _ensure_entity(session: Session, seed: ManualEdgeSeed, *, side: str) -> None:
    entity_type = seed.from_entity_type if side == "from" else seed.to_entity_type
    entity_id = seed.from_entity_id if side == "from" else seed.to_entity_id
    name = seed.from_name if side == "from" else seed.to_name
    company = seed.from_company if side == "from" else seed.to_company
    exchange = seed.from_exchange if side == "from" else seed.to_exchange
    if entity_type == "stock":
        _upsert_stock(
            session,
            symbol=entity_id,
            exchange=exchange,
            name=name,
            company_name=company,
            country="US" if exchange in {"NASDAQ", "NYSE"} else "CN",
        )
    elif entity_type == "sector" and session.get(SectorCanonical, entity_id) is None:
        session.add(SectorCanonical(id=entity_id, name=name or entity_id, type="concept"))
        session.flush()
    elif entity_type == "market_variable" and session.get(MarketVariable, entity_id) is None:
        session.add(MarketVariable(id=entity_id, name=name or entity_id, source="manual"))
        session.flush()


def _upsert_stock(
    session: Session,
    *,
    symbol: str,
    exchange: str,
    name: str,
    company_name: str,
    country: str,
) -> Stock:
    stock = session.scalar(select(Stock).where(Stock.symbol == symbol, Stock.exchange == exchange))
    if stock is not None:
        return stock
    company = session.scalar(select(Company).where(Company.name == company_name))
    if company is None:
        company = Company(name=company_name, country=country)
        session.add(company)
        session.flush()
    stock = Stock(symbol=symbol, exchange=exchange, name=name, company=company)
    session.add(stock)
    session.flush()
    return stock


def main() -> None:
    with SessionLocal() as session:
        result = seed_manual_edges(session)
    print(
        f"seed_manual_edges inserted_edges={result.inserted_edges} "
        f"inserted_evidence={result.inserted_evidence}"
    )


if __name__ == "__main__":
    main()
