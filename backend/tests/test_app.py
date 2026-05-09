from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.data.database import get_session
from app.main import app


def test_healthz_returns_ok() -> None:
    client = TestClient(app)

    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz_returns_ok() -> None:
    class ReadySession:
        def execute(self, statement: object) -> None:
            return None

    def override_session() -> ReadySession:
        return ReadySession()

    app.dependency_overrides[get_session] = override_session
    client = TestClient(app)

    try:
        response = client.get("/readyz")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_readyz_returns_503_when_database_is_unavailable() -> None:
    class BrokenSession:
        def execute(self, statement: object) -> None:
            raise OperationalError("SELECT 1", {}, Exception("database offline"))

    def override_session() -> BrokenSession:
        return BrokenSession()

    app.dependency_overrides[get_session] = override_session
    client = TestClient(app)

    try:
        response = client.get("/readyz")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["detail"] == "Database is not ready"


def test_api_v1_ping_returns_typed_payload() -> None:
    client = TestClient(app)

    response = client.get("/api/v1/ping")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "message": "pong"}


def test_metrics_exposes_core_adr_metrics() -> None:
    client = TestClient(app)

    response = client.get("/metrics")

    assert response.status_code == 200
    body = response.text
    assert 'runs_total{skill="demo",status="succeeded",trigger="api"} 0' in body
    assert 'alerts_total{priority="high",channel="web",state="sent"} 0' in body
    assert 'llm_tokens_total{provider="stub",model="stub",task_kind="qa"} 0' in body
    assert 'collector_failures_total{source="akshare",error_type="unknown"} 0' in body


def test_http_errors_use_problem_details() -> None:
    client = TestClient(app)

    response = client.get("/missing")

    assert response.status_code == 404
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json() == {
        "type": "about:blank",
        "title": "Not Found",
        "status": 404,
        "detail": "Not Found",
        "instance": "/missing",
    }
