from io import BytesIO
from pathlib import Path
from urllib.error import URLError

import pytest

from app.data.collectors import (
    SchemaDriftError,
    collect_optional_sdk_source,
    collect_tushare_financials,
    ensure_announcements_dir,
    fetch_fred_csv_sample,
)


class FakeResponse:
    def __init__(self, body: str) -> None:
        self.body = body

    def read(self) -> bytes:
        return BytesIO(self.body.encode()).read()


def test_tushare_collector_skips_without_token() -> None:
    result = collect_tushare_financials(token="")

    assert result.status == "skipped"
    assert result.degradation == {"reason": "token_missing"}


def test_optional_sdk_collector_reports_missing_dependency() -> None:
    result = collect_optional_sdk_source("akshare", "definitely_missing_akshare")

    assert result.status == "skipped"
    assert result.degradation == {"reason": "dependency_missing"}


def test_fred_collector_validates_csv_schema() -> None:
    result = fetch_fred_csv_sample(
        "DGS10",
        opener=lambda _url, _timeout: FakeResponse(
            "observation_date,DGS10\n2026-05-01,4.10\n2026-05-04,4.12\n"
        ),
    )

    assert result.status == "ok"
    assert result.rows == 2


def test_fred_collector_reports_timeout_degradation() -> None:
    result = fetch_fred_csv_sample(
        "DGS10",
        opener=lambda _url, _timeout: (_ for _ in ()).throw(URLError("timeout")),
    )

    assert result.status == "failed"
    assert result.degradation == {"reason": "URLError"}


def test_fred_collector_raises_schema_drift() -> None:
    with pytest.raises(SchemaDriftError):
        fetch_fred_csv_sample(
            "DGS10",
            opener=lambda _url, _timeout: FakeResponse("date,value\n2026-05-01,4.10\n"),
        )


def test_announcement_dir_is_created(tmp_path: Path) -> None:
    target = ensure_announcements_dir(tmp_path / "announcements")

    assert target.exists()
