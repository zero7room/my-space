from fastapi.testclient import TestClient

from app.main import app


def test_core_api_contracts_return_typed_mock_payloads() -> None:
    client = TestClient(app)

    sector = client.get("/api/v1/sectors/BK_CPO/latest")
    assert sector.status_code == 200
    assert sector.json()["id"] == "BK_CPO"
    assert "leaders" in sector.json()
    assert sector.json()["as_of"]
    assert 0 <= sector.json()["metric_coverage"] <= 1
    assert client.get("/api/v1/sectors/UNKNOWN_SECTOR/latest").status_code == 404

    symbol = client.get("/api/v1/symbols/300308.SZ/latest")
    assert symbol.status_code == 200
    assert symbol.json()["code"] == "300308.SZ"
    assert symbol.json()["leader_score"]["weight_template_version"]
    assert client.get("/api/v1/symbols/UNKNOWN/latest").status_code == 404

    run = client.get("/api/v1/runs/demo-run")
    assert run.status_code == 200
    assert run.json()["id"] == "demo-run"

    artifact = client.get("/api/v1/artifacts/demo-run")
    assert artifact.status_code == 200
    assert artifact.json()["run_id"] == "demo-run"
    assert artifact.json()["conclusions"]

    impact_artifact = client.get("/api/v1/artifacts/run_nvda_impact_20260508")
    assert impact_artifact.status_code == 200
    assert impact_artifact.json()["subject"]["id"] == "EVT_NVDA_GUIDE"
    assert "传导" in impact_artifact.json()["summary"]
    assert client.get("/api/v1/artifacts/unknown-run").status_code == 404

    alerts = client.get("/api/v1/alerts")
    assert alerts.status_code == 200
    assert alerts.json()["items"]
    assert alerts.json()["items"][0]["open_chat_thread_id"] == "thread_cpo"

    alert_detail = client.get(f"/api/v1/alerts/{alerts.json()['items'][0]['alert_id']}")
    assert alert_detail.status_code == 200
    assert alert_detail.json()["state"] in {
        "active",
        "sent",
        "merged",
        "capped",
        "deferred",
        "suppressed",
    }
    assert "channels" in alert_detail.json()
    assert "parent_alert_id" in alert_detail.json()
    assert "sent_at" in alert_detail.json()

    strategies = client.get("/api/v1/strategies")
    assert strategies.status_code == 200
    assert strategies.json()["items"]

    strategy_detail = client.get(f"/api/v1/strategies/{strategies.json()['items'][0]['id']}")
    assert strategy_detail.status_code == 200
    assert strategy_detail.json()["dsl"]["skill"]
