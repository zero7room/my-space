from collections.abc import Callable
from typing import Any

from pydantic import BaseModel, Field

ToolHandler = Callable[[dict[str, Any]], dict[str, Any]]


class ToolDefinition(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    handler: ToolHandler = Field(exclude=True)

    model_config = {"arbitrary_types_allowed": True}


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register(self, definition: ToolDefinition) -> None:
        self._tools[definition.name] = definition

    def names(self) -> list[str]:
        return sorted(self._tools)

    def describe(self) -> list[dict[str, Any]]:
        return [
            tool.model_dump(exclude={"handler"})
            for tool in sorted(self._tools.values(), key=lambda item: item.name)
        ]

    def execute(self, name: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            definition = self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Tool is not registered: {name}") from exc
        return definition.handler(payload)


def default_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    for definition in [
        ToolDefinition(
            name="get_kline",
            description="Return mock daily kline points for a symbol.",
            input_schema={"type": "object", "required": ["symbol"]},
            output_schema={"type": "object", "required": ["symbol", "points"]},
            handler=_get_kline,
        ),
        ToolDefinition(
            name="get_sector_members",
            description="Return mock sector members with latest return and turnover.",
            input_schema={"type": "object", "required": ["sector_id"]},
            output_schema={"type": "object", "required": ["sector_id", "members"]},
            handler=_get_sector_members,
        ),
        ToolDefinition(
            name="get_company_metrics",
            description="Return mock fundamentals and valuation metrics.",
            input_schema={"type": "object", "required": ["symbol"]},
            output_schema={"type": "object", "required": ["symbol", "metrics"]},
            handler=_get_company_metrics,
        ),
        ToolDefinition(
            name="query_edges",
            description="Return mock graph edges around a subject.",
            input_schema={"type": "object", "required": ["subject_id"]},
            output_schema={"type": "object", "required": ["subject_id", "edges"]},
            handler=_query_edges,
        ),
        ToolDefinition(
            name="get_evidence",
            description="Return mock evidence by id.",
            input_schema={"type": "object", "required": ["evidence_id"]},
            output_schema={"type": "object", "required": ["evidence_id", "source"]},
            handler=_get_evidence,
        ),
        ToolDefinition(
            name="extract_filing",
            description="Extract entities, orders, risks, and outlook from filing text.",
            input_schema={"type": "object"},
            output_schema={"type": "object"},
            handler=_extract_filing_tool,
        ),
    ]:
        registry.register(definition)
    return registry


def _get_kline(payload: dict[str, Any]) -> dict[str, Any]:
    symbol = str(payload["symbol"])
    return {
        "symbol": symbol,
        "points": [
            {"date": "2026-05-06", "close": 161.2, "volume": 28400000},
            {"date": "2026-05-07", "close": 165.7, "volume": 31800000},
            {"date": "2026-05-08", "close": 169.4, "volume": 35600000},
        ],
    }


def _get_sector_members(payload: dict[str, Any]) -> dict[str, Any]:
    sector_id = str(payload["sector_id"])
    return {
        "sector_id": sector_id,
        "members": [
            {"symbol": "300308", "name": "中际旭创", "return_pct": 3.2, "turnover": 35600000},
            {"symbol": "300502", "name": "新易盛", "return_pct": 2.6, "turnover": 22900000},
            {"symbol": "000988", "name": "华工科技", "return_pct": 1.4, "turnover": 14100000},
        ],
    }


def _get_company_metrics(payload: dict[str, Any]) -> dict[str, Any]:
    symbol = str(payload["symbol"])
    return {
        "symbol": symbol,
        "metrics": {
            "market_cap": 132_000_000_000,
            "revenue_growth_yoy": 0.18,
            "roe": 0.21,
            "gross_margin": 0.34,
            "valuation_percentile": 0.62,
            "governance_risk_tags": ["customer_concentration"],
        },
    }


def _query_edges(payload: dict[str, Any]) -> dict[str, Any]:
    subject_id = str(payload["subject_id"])
    return {
        "subject_id": subject_id,
        "edges": [
            {
                "source": "NVDA",
                "target": "300308",
                "relation": "influences",
                "relation_class": "fact",
                "confidence": 0.88,
                "evidence": ["ev_manual_nvda_cpo"],
            },
            {
                "source": "300308",
                "target": "BK_CPO",
                "relation": "member_of",
                "relation_class": "fact",
                "confidence": 0.95,
                "evidence": ["ev_sector_mapping"],
            },
        ],
    }


def _get_evidence(payload: dict[str, Any]) -> dict[str, Any]:
    evidence_id = str(payload["evidence_id"])
    return {
        "evidence_id": evidence_id,
        "source": "mock",
        "source_url": None,
        "content_hash": "mock-hash",
        "excerpt": "Mock evidence used by M2-M4 service skeleton.",
    }


def _extract_filing_tool(payload: dict[str, Any]) -> dict[str, Any]:
    from app.skills.extract_filing import extract_filing

    return extract_filing(
        text=payload.get("text"),
        pdf_path=payload.get("pdf_path"),
    ).model_dump()
