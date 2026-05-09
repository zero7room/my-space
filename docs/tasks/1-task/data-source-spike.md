# M1 Data Source Spike

Date: 2026-05-09

Scope: verify first-stage source coverage, failure shapes, and downgrade paths before locking the M1 schema. This spike intentionally uses public or local probes only. It does not require private tokens; `TUSHARE_TOKEN` is empty in this environment and Tushare-dependent calls are skipped by design.

## Environment Probe

Command run from `backend/`:

```bash
uv run python - <<'PY'
import importlib.util
for name in ['akshare','yfinance','tushare','pandas','requests']:
    print(f'{name}={importlib.util.find_spec(name) is not None}')
PY
uv run python - <<'PY'
import os
print('TUSHARE_TOKEN_SET=' + str(bool(os.getenv('TUSHARE_TOKEN'))))
PY
uv run python - <<'PY'
from urllib.request import urlopen
for series in ['DGS10','CPIAUCSL']:
    url=f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}'
    with urlopen(url, timeout=10) as r:
        sample=r.read(160).decode('utf-8', errors='replace')
    print(series, sample.splitlines()[:3])
PY
```

Observed result:

- `akshare=False`, `yfinance=False`, `tushare=False`, `pandas=False`, `requests=False`.
- `TUSHARE_TOKEN_SET=False`.
- FRED public CSV worked for `DGS10` and `CPIAUCSL`; returned header plus historical rows without an API key.

## Coverage Findings

| Domain | Target Source | Spike Result | Schema Impact |
|---|---|---|---|
| A-share daily/minute行情 | akshare | SDK not installed in current backend env; collector must be optional dependency or later dependency addition. Expected APIs: `stock_zh_a_hist` for daily and minute-period variants. | `market_metric` can store normalized OHLC/turnover snapshots; raw payload remains in `Evidence.extra.stat` or future raw table. |
| A-share sector/member | akshare | SDK not installed; design keeps provider codes in `sector_provider` and canonical mapping in `sector_mapping`. | `sector_provider(provider, provider_code)` unique key is required; membership eligibility uses stored `relevance * confidence`. |
| A-share financial fields | akshare + Tushare fallback | Tushare SDK missing and `TUSHARE_TOKEN` empty, so fallback must skip without error. | `financial_metric` stores sparse metrics; unavailable fields stay absent/null upstream, not zero-filled. |
| Announcement PDF/text | akshare or manual sample | SDK not installed. M1 stores the source artifact as `Evidence(type='announcement'|'manual', url_or_path, hash, extra.degradation?)`. | `evidence.url_or_path`, `hash` unique constraint, and `extra` JSONB cover PDF roots. |
| US stock行情/财报 | yfinance | SDK not installed. Target sample remains NVDA/TSLA/AAPL one-year daily and recent statements when dependency is added. | `stock` supports non-CN exchanges/currency; `market_metric` and `financial_metric` share subject ids and source. |
| FRED rates/CPI | public FRED CSV | `DGS10` and `CPIAUCSL` public CSV returned rows successfully without key. | `market_variable` stores series identity; observations fit `market_metric` with `source='fred'`. |

## Actual Downgrade Samples for Data-Layer §8

| Failure Shape | Actual Trigger Sample | Downgrade Behavior |
|---|---|---|
| Short unavailable / timeout | Network probe uses `urlopen(..., timeout=10)`; a timeout raises `TimeoutError`/`URLError`. | Retry with exponential backoff; if exhausted, read latest successful snapshot and mark downstream freshness stale. |
| Rate limit / frequency limit | Tushare token is empty and SDK is absent; the collector can detect this before request. Public SDK APIs commonly surface 429/provider messages, but no tokened call was made in this spike. | Skip Tushare collector with structured degradation `{source:'tushare', reason:'token_missing'}`; delayed queue for real 429 once enabled. |
| Long unavailable > 1 trading day | akshare/yfinance SDK imports fail locally: `importlib.util.find_spec(...) is None`. | Mark source unavailable in collector run metadata; do not fabricate metrics. Skills lower confidence when required source has no current snapshot. |
| Field disappeared / renamed | Dependency absence is the current concrete schema failure. Future collector mappers must raise `SchemaDriftError` when required columns are missing from returned frames. | Switch to fallback source when configured; otherwise record field as unavailable in Evidence degradation metadata. |
| Field semantic drift | Not observable without live akshare/yfinance payloads. Guardrail is to store raw payload and source timestamp and keep mapper tests with sample fixtures once collectors are added. | Freeze affected conclusions until manual ADR or mapper update. |
| Blocked IP / account invalid | `TUSHARE_TOKEN_SET=False` is a credential-invalid equivalent for first-stage local runs. | Disable source for this run; write a high-priority operational trace when orchestration metrics are added. |

## Collector Contract Notes

- Tushare collector must be a no-op when `TUSHARE_TOKEN` is empty.
- Source SDK imports must be lazy inside collectors, not at FastAPI import time.
- Missing fields must propagate as missing/unavailable, never as `0`.
- Every successful raw item should create or reuse an `Evidence` row by `hash`.
- Every degraded fetch should write degradation context into `Evidence.extra.degradation` or future `collector_run` metadata.

## Review Decision

The M1 schema can proceed with the current normalized entities, metrics, `Evidence`, and relation tables because the spike confirms the schema needs sparse, source-tagged observations and explicit degradation metadata more than source-specific columns. Live akshare/yfinance/Tushare collectors remain dependency-gated implementation work; the foundation must remain testable without private tokens.
