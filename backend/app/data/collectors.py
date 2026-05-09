from __future__ import annotations

import csv
import importlib.util
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, cast
from urllib.error import URLError
from urllib.request import urlopen


class CollectorUnavailable(RuntimeError):
    pass


class SchemaDriftError(RuntimeError):
    pass


@dataclass(frozen=True)
class CollectorResult:
    source: str
    status: str
    rows: int = 0
    degradation: dict[str, str] | None = None


class HttpResponse(Protocol):
    def read(self) -> bytes: ...


class UrlOpener(Protocol):
    def __call__(self, url: str, timeout: int) -> HttpResponse: ...


def dependency_available(module_name: str) -> bool:
    return importlib.util.find_spec(module_name) is not None


def collect_tushare_financials(token: str | None = None) -> CollectorResult:
    resolved_token = token if token is not None else os.getenv("TUSHARE_TOKEN")
    if not resolved_token:
        return CollectorResult(
            source="tushare",
            status="skipped",
            degradation={"reason": "token_missing"},
        )
    if not dependency_available("tushare"):
        return CollectorResult(
            source="tushare",
            status="skipped",
            degradation={"reason": "dependency_missing"},
        )
    return CollectorResult(source="tushare", status="ready")


def collect_optional_sdk_source(source: str, module_name: str) -> CollectorResult:
    if not dependency_available(module_name):
        return CollectorResult(
            source=source,
            status="skipped",
            degradation={"reason": "dependency_missing"},
        )
    return CollectorResult(source=source, status="ready")


def fetch_fred_csv_sample(
    series_id: str,
    *,
    opener: UrlOpener | None = None,
) -> CollectorResult:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}"
    resolved_opener = opener or cast(UrlOpener, urlopen)
    try:
        response = resolved_opener(url, 10)
        raw = response.read().decode("utf-8", errors="replace")
    except (TimeoutError, URLError) as exc:
        return CollectorResult(
            source="fred",
            status="failed",
            degradation={"reason": exc.__class__.__name__},
        )

    rows = list(csv.DictReader(raw.splitlines()))
    if not rows or "observation_date" not in rows[0] or series_id not in rows[0]:
        raise SchemaDriftError(f"FRED CSV schema changed for {series_id}")
    return CollectorResult(source="fred", status="ok", rows=len(rows))


def ensure_announcements_dir(path: Path = Path("data/raw/announcements")) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
