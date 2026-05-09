from typing import Any, Protocol, TypeVar, cast

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data import models


class EvidenceAttachable(Protocol):
    id: str
    evidence: list[str]


ModelT = TypeVar("ModelT")


class Repository[ModelT]:
    model: type[ModelT]

    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_id(self, id: str) -> ModelT | None:
        return self.session.get(self.model, id)

    def find(self, **filters: Any) -> list[ModelT]:
        statement = select(self.model)
        for key, value in filters.items():
            statement = statement.where(getattr(self.model, key) == value)
        return list(self.session.scalars(statement))

    def attach_evidence(self, id: str, evidence_id: str) -> None:
        entity = self.get_by_id(id)
        if entity is None:
            raise LookupError(f"{self.model.__name__} {id} does not exist")
        if hasattr(entity, "evidence"):
            evidence_values = cast(EvidenceAttachable, entity).evidence
            if str(evidence_id) not in evidence_values:
                evidence_values.append(str(evidence_id))
        else:
            owner_type = str(cast(Any, self.model).__tablename__)
            link = self.session.get(
                models.EvidenceLink,
                {
                    "owner_type": owner_type,
                    "owner_id": id,
                    "evidence_id": str(evidence_id),
                },
            )
            if link is None:
                self.session.add(
                    models.EvidenceLink(
                        owner_type=owner_type,
                        owner_id=id,
                        evidence_id=str(evidence_id),
                    )
                )
        self.session.flush()


class StockRepository(Repository[models.Stock]):
    model = models.Stock

    def upsert(
        self,
        *,
        symbol: str,
        exchange: str,
        name: str,
        company_name: str,
        currency: str | None = None,
        raw: dict[str, Any] | None = None,
    ) -> models.Stock:
        stock = self.session.scalar(
            select(models.Stock).where(
                models.Stock.symbol == symbol,
                models.Stock.exchange == exchange,
            )
        )
        company = self.session.scalar(
            select(models.Company).where(models.Company.name == company_name)
        )
        if company is None:
            company = models.Company(name=company_name)
            self.session.add(company)
            self.session.flush()

        if stock is None:
            stock = models.Stock(
                symbol=symbol,
                exchange=exchange,
                name=name,
                company=company,
                currency=currency,
                raw=raw or {},
            )
            self.session.add(stock)
        else:
            stock.name = name
            stock.company = company
            stock.currency = currency
            stock.raw = raw or stock.raw
        self.session.flush()
        return stock


class CompanyRepository(Repository[models.Company]):
    model = models.Company

    def upsert(
        self,
        *,
        name: str,
        country: str | None = None,
    ) -> models.Company:
        company = self.session.scalar(select(models.Company).where(models.Company.name == name))
        if company is None:
            company = models.Company(name=name, country=country)
            self.session.add(company)
        else:
            company.country = country
        self.session.flush()
        return company


class ProductRepository(Repository[models.Product]):
    model = models.Product

    def upsert(
        self,
        *,
        id: str,
        name: str,
        category: str | None = None,
        raw: dict[str, Any] | None = None,
    ) -> models.Product:
        product = self.session.get(models.Product, id)
        if product is None:
            product = models.Product(id=id, name=name, category=category, raw=raw or {})
            self.session.add(product)
        else:
            product.name = name
            product.category = category
            product.raw = raw or product.raw
        self.session.flush()
        return product


class CommodityRepository(Repository[models.Commodity]):
    model = models.Commodity

    def upsert(
        self,
        *,
        id: str,
        name: str,
        unit: str | None = None,
        currency: str | None = None,
        raw: dict[str, Any] | None = None,
    ) -> models.Commodity:
        commodity = self.session.get(models.Commodity, id)
        if commodity is None:
            commodity = models.Commodity(
                id=id,
                name=name,
                unit=unit,
                currency=currency,
                raw=raw or {},
            )
            self.session.add(commodity)
        else:
            commodity.name = name
            commodity.unit = unit
            commodity.currency = currency
            commodity.raw = raw or commodity.raw
        self.session.flush()
        return commodity


class MarketVariableRepository(Repository[models.MarketVariable]):
    model = models.MarketVariable

    def upsert(
        self,
        *,
        id: str,
        name: str,
        source: str,
        unit: str | None = None,
        raw: dict[str, Any] | None = None,
    ) -> models.MarketVariable:
        variable = self.session.get(models.MarketVariable, id)
        if variable is None:
            variable = models.MarketVariable(
                id=id,
                name=name,
                source=source,
                unit=unit,
                raw=raw or {},
            )
            self.session.add(variable)
        else:
            variable.name = name
            variable.source = source
            variable.unit = unit
            variable.raw = raw or variable.raw
        self.session.flush()
        return variable


class MarketEventRepository(Repository[models.MarketEvent]):
    model = models.MarketEvent

    def upsert(
        self,
        *,
        id: str,
        title: str,
        occurred_at: Any,
        source: str,
        raw: dict[str, Any] | None = None,
    ) -> models.MarketEvent:
        event = self.session.get(models.MarketEvent, id)
        if event is None:
            event = models.MarketEvent(
                id=id,
                title=title,
                occurred_at=occurred_at,
                source=source,
                raw=raw or {},
            )
            self.session.add(event)
        else:
            event.title = title
            event.occurred_at = occurred_at
            event.source = source
            event.raw = raw or event.raw
        self.session.flush()
        return event
