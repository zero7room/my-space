from typing import Any

from pydantic import BaseModel, Field

from app.runtime.schemas import RelationClass


class ExtractedEvidence(BaseModel):
    evidence_id: str
    relation_class: RelationClass = "inferred"
    confidence: float = Field(ge=0, le=1)
    source: str


class FilingExtraction(BaseModel):
    subjects: list[str] = Field(default_factory=list)
    products: list[str] = Field(default_factory=list)
    customers: list[str] = Field(default_factory=list)
    orders: list[dict[str, Any]] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    outlook: list[str] = Field(default_factory=list)
    evidence: ExtractedEvidence


SUBJECTS = ["中际旭创", "新易盛", "华工科技", "天孚通信", "沪电股份"]
PRODUCTS = ["光模块", "CPO", "交换机", "PCB"]
CUSTOMERS = ["英伟达", "NVIDIA", "微软", "谷歌", "亚马逊"]
RISK_PATTERNS = ["客户集中度较高", "汇率波动风险", "原材料价格波动", "订单不及预期"]


def extract_filing(*, text: str | None = None, pdf_path: str | None = None) -> FilingExtraction:
    source_text = text or f"PDF:{pdf_path or 'unknown'}"
    subjects = _find_terms(source_text, SUBJECTS)
    products = _find_terms(source_text, PRODUCTS)
    customers = _normalize_customers(_find_terms(source_text, CUSTOMERS))
    risks = _find_terms(source_text, RISK_PATTERNS)
    outlook = _extract_outlook(source_text)
    orders = _extract_orders(source_text, products, customers)

    return FilingExtraction(
        subjects=subjects,
        products=products,
        customers=customers,
        orders=orders,
        risks=risks,
        outlook=outlook,
        evidence=ExtractedEvidence(
            evidence_id="ev_inferred_filing_mock",
            confidence=0.72 if text else 0.55,
            source="text" if text else "pdf_path",
        ),
    )


def _find_terms(text: str, terms: list[str]) -> list[str]:
    return [term for term in terms if term in text]


def _normalize_customers(customers: list[str]) -> list[str]:
    normalized = ["英伟达" if item == "NVIDIA" else item for item in customers]
    return list(dict.fromkeys(normalized))


def _extract_outlook(text: str) -> list[str]:
    outlook: list[str] = []
    for marker in ["预计", "预期", "增长"]:
        if marker in text:
            outlook.append("业绩预期偏正面")
            break
    return outlook


def _extract_orders(text: str, products: list[str], customers: list[str]) -> list[dict[str, Any]]:
    if "订单" not in text:
        return []
    positive_markers = ["收到", "增长", "新增", "签订"]
    direction = "positive" if any(token in text for token in positive_markers) else "neutral"
    return [
        {
            "product": products[0] if products else None,
            "customer": customers[0] if customers else None,
            "direction": direction,
            "confidence": 0.74,
        }
    ]
