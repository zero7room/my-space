from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from app.llm.gateway import LLMGateway, LLMRunLimitExceeded
from app.main import app
from app.orchestration.alerts import (
    AlertCandidate,
    AlertGate,
    AlertPriority,
    AlertStore,
    SubjectRef,
)
from app.orchestration.dsl import RuleParser, evaluate_rule
from app.runtime.tools import default_tool_registry
from app.skills.extract_filing import extract_filing


def test_core_artifact_endpoints_return_typed_mock_payloads() -> None:
    client = TestClient(app)

    sector = client.get("/api/v1/analysis/sectors/BK_CPO").json()
    leaders = client.get("/api/v1/analysis/sectors/BK_CPO/leaders").json()
    value = client.get("/api/v1/analysis/symbols/300308/value").json()
    market = client.get("/api/v1/analysis/market/overview").json()
    chain = client.get("/api/v1/analysis/symbols/300308/supply-chain").json()

    assert sector["skill"] == "sector_center"
    assert sector["subject"] == {"type": "sector", "id": "BK_CPO", "name": "光模块"}
    assert sector["data"]["sector_id"] == "BK_CPO"
    assert leaders["skill"] == "leader_identification"
    assert leaders["data"]["leaders"][0]["weight_template_version"] == "tech-v1"
    assert value["skill"] == "long_term_value"
    assert market["skill"] == "market_overview"
    assert chain["skill"] == "supply_chain_analysis"
    assert all(
        "run_id" in payload and "conclusions" in payload
        for payload in [sector, leaders, value, market, chain]
    )


def test_tool_registry_exposes_required_tools_and_executes_mock_data() -> None:
    registry = default_tool_registry()

    assert sorted(registry.names()) == [
        "extract_filing",
        "get_company_metrics",
        "get_evidence",
        "get_kline",
        "get_sector_members",
        "query_edges",
    ]

    members = registry.execute("get_sector_members", {"sector_id": "BK_CPO"})
    edges = registry.execute("query_edges", {"subject_id": "NVDA"})

    assert members["sector_id"] == "BK_CPO"
    assert members["members"][0]["symbol"] == "300308"
    assert edges["edges"][0]["relation_class"] == "fact"


def test_llm_gateway_routes_records_cache_trace_and_enforces_limits() -> None:
    gateway = LLMGateway(max_calls=2, max_tokens=120)

    first = gateway.complete(
        run_id="run-llm-1",
        task_kind="extract",
        latency_budget="low",
        messages=[{"role": "user", "content": "抽取公告"}],
        prompt_cache_key="filing:v1",
    )
    second = gateway.complete(
        run_id="run-llm-1",
        task_kind="qa",
        latency_budget="normal",
        messages=[{"role": "user", "content": "光模块龙头是谁"}],
        prompt_cache_key="qa:v1",
    )

    assert first.provider == "deepseek"
    assert second.provider in {"openai", "anthropic"}
    assert gateway.trace[0].prompt_cache_key == "filing:v1"
    assert gateway.trace[0].cache_hit is False
    cached = gateway.complete(
        run_id="run-llm-2",
        task_kind="extract",
        latency_budget="low",
        messages=[{"role": "user", "content": "抽取公告"}],
        prompt_cache_key="filing:v1",
    )
    assert cached.cache_hit is True
    assert cached.prompt_tokens < first.prompt_tokens

    with pytest.raises(LLMRunLimitExceeded):
        gateway.complete(
            run_id="run-llm-1",
            task_kind="summarize",
            latency_budget="low",
            messages=[{"role": "user", "content": "再总结"}],
        )
    assert gateway.trace[-1].provider == "limit"


def test_extract_filing_golden_fixture_identifies_subjects_and_risks() -> None:
    fixture = (
        "中际旭创公告称，公司收到英伟达下一代AI服务器光模块订单，"
        "预计2026年收入增长约18%。主要客户集中度较高，存在汇率波动风险。"
    )

    result = extract_filing(text=fixture)

    assert result.subjects == ["中际旭创"]
    assert result.products == ["光模块"]
    assert result.customers == ["英伟达"]
    assert result.orders[0]["direction"] == "positive"
    assert "客户集中度较高" in result.risks
    assert result.evidence.relation_class == "inferred"


def test_strategy_dsl_honors_versioned_metric_baseline_semantics() -> None:
    parser = RuleParser()
    rule = parser.parse(
        {
            "id": "leader_score_change",
            "name": "龙头综合分变化",
            "condition": {
                "all_of": [
                    {
                        "metric": "leader_score.composite",
                        "subject": {"type": "sector", "id": "BK_CPO"},
                        "changed_by": ">= 0.05",
                        "window": "1d",
                    }
                ]
            },
            "output": {"priority": "high", "message_template": "光模块综合分变化"},
        }
    )

    assert (
        evaluate_rule(
            rule,
            {
                "metrics": {
                    "leader_score.composite": {
                        "current": {
                            "value": 0.86,
                            "weight_template_version": "tech-v2",
                            "baseline": True,
                        },
                        "previous": {"value": 0.70, "weight_template_version": "tech-v1"},
                    }
                }
            },
        )
        is None
    )
    candidate = evaluate_rule(
        rule,
        {
            "metrics": {
                "leader_score.composite": {
                    "current": {"value": 0.86, "weight_template_version": "tech-v1"},
                    "previous": {"value": 0.80, "weight_template_version": "tech-v1"},
                }
            }
        },
    )
    assert candidate is not None
    assert candidate.priority == "high"
    assert candidate.ctx["weight_template_version"] == "tech-v1"


def test_alert_gate_marks_sent_merged_deferred_capped_and_suppressed() -> None:
    now = datetime(2026, 5, 8, 10, 0, tzinfo=UTC)
    store = AlertStore()
    gate = AlertGate(
        store=store,
        now=lambda: now,
        daily_caps={AlertPriority.HIGH: 1, AlertPriority.MEDIUM: 10, AlertPriority.LOW: 5},
        merge_threshold=2,
    )

    first = _candidate(rule_id="r1", priority=AlertPriority.HIGH)
    sent = gate.process(first)
    duplicate = gate.process(_candidate(rule_id="r1", priority=AlertPriority.HIGH))
    merged = gate.process(_candidate(rule_id="r2", priority=AlertPriority.MEDIUM))
    capped = gate.process(_candidate(rule_id="r3", priority=AlertPriority.HIGH))

    quiet_gate = AlertGate(store=store, now=lambda: now.replace(hour=22))
    deferred = quiet_gate.process(_candidate(rule_id="r4", priority=AlertPriority.MEDIUM))
    suppressed = quiet_gate.process(_candidate(rule_id="r5", priority=AlertPriority.LOW))

    assert [record.state for record in [sent, duplicate, merged, capped, deferred, suppressed]] == [
        "sent",
        "suppressed",
        "merged",
        "capped",
        "deferred",
        "suppressed",
    ]
    assert len(store.daily_fallback(now.date())) == 4


def test_alert_record_can_be_persisted_to_database_model() -> None:
    now = datetime(2026, 5, 8, 10, 0, tzinfo=UTC)
    store = AlertStore()
    gate = AlertGate(store=store, now=lambda: now)

    record = gate.process(_candidate(rule_id="r1", priority=AlertPriority.HIGH))
    db_record = record.to_db_model()

    assert db_record.rule_id == "r1"
    assert db_record.subject_type == "sector"
    assert db_record.subject_id == "BK_CPO"
    assert db_record.state == "sent"
    assert db_record.sent_at == now
    assert db_record.channels["in_app"]["accepted"] is True


def test_alert_api_lists_context_and_followup_fields() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/alerts")

    assert response.status_code == 200
    payload = response.json()
    assert payload["items"][0]["state"] in {"sent", "merged", "capped", "deferred", "suppressed"}
    assert "ctx" in payload["items"][0]
    assert "follow_up" in payload["items"][0]


def _candidate(rule_id: str, priority: AlertPriority) -> AlertCandidate:
    return AlertCandidate(
        rule_id=rule_id,
        alert_type="leader_score_change",
        subject=SubjectRef(type="sector", id="BK_CPO", name="光模块"),
        priority=priority,
        title=f"{rule_id} 光模块提醒",
        summary="中际旭创综合分变化",
        evidence=["ev_metric_001"],
        artifact_run_id="run-leader-BK_CPO",
        ctx={"delta": 0.06},
        created_at=datetime(2026, 5, 8, 10, 0, tzinfo=UTC) + timedelta(minutes=int(rule_id[-1])),
    )
