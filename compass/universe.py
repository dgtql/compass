"""US ticker universe — the pool of names a PM can hire an analyst against.

The seed source is the SEC's authoritative ticker file
(``company_tickers_exchange.json``), which lists every US filer with their
CIK, ticker, exchange, and registered name. The CIK is what
``compass.ingest.edgar`` already needs to fetch filings, so this file is
the right primary source for everything downstream.

Layout on disk::

    compass/data/universe/us-tickers.json

The file is shipped with the package so ``pip install`` is self-sufficient.
``compass refresh-universe`` re-fetches and (optionally) enriches with
yfinance to backfill sector / industry / market-cap fields.

Schema (one record per ticker)::

    {
      "as_of":  "2026-05-13",
      "region": "US",
      "source": "sec:company_tickers_exchange",
      "tickers": [
        {
          "cik":         320193,
          "ticker":      "AAPL",
          "name":        "Apple Inc.",
          "exchange":    "NASDAQ",
          "sector":      "Technology",        // optional, post-enrichment
          "industry":    "Consumer Electronics", // optional
          "market_cap":  3210000000000          // optional, USD
        }
      ]
    }
"""

from __future__ import annotations

import json
import os
import time
from dataclasses import asdict, dataclass, field
from datetime import date
from pathlib import Path
from typing import Any, Iterable

import compass

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers_exchange.json"

REGIONS: tuple[str, ...] = ("US",)

# GICS top-level sectors — hardcoded because the list is small, stable, and
# the canonical source (MSCI) is paid. yfinance returns these names verbatim,
# which keeps the seed → enrichment loop simple.
GICS_SECTORS: tuple[str, ...] = (
    "Communication Services",
    "Consumer Discretionary",
    "Consumer Staples",
    "Energy",
    "Financials",
    "Health Care",
    "Industrials",
    "Information Technology",
    "Materials",
    "Real Estate",
    "Utilities",
)

# EDGAR's exchange field is loosely populated. v1 collapses everything into
# four buckets so the UI can render a clean filter.
_EXCHANGE_BUCKETS: dict[str, str] = {
    "NYSE":         "NYSE",
    "NYSE Arca":    "NYSE",
    "NYSE American":"AMEX",
    "NYSEAmerican": "AMEX",
    "NYSEAm":       "AMEX",
    "Nasdaq":       "NASDAQ",
    "NASDAQ":       "NASDAQ",
    "NasdaqGS":     "NASDAQ",
    "NasdaqGM":     "NASDAQ",
    "NasdaqCM":     "NASDAQ",
    "BATS":         "NYSE",
    "CBOE":         "NYSE",
    "OTC":          "OTC",
    "OTCBB":        "OTC",
    "Pink Sheets":  "OTC",
}

ALLOWED_EXCHANGES: tuple[str, ...] = ("NYSE", "NASDAQ", "AMEX")


# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------


def universe_path() -> Path:
    """Where the seed JSON lives on disk (inside the installed package)."""
    base = Path(compass.__file__).resolve().parent
    return base / "data" / "universe" / "us-tickers.json"


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class Ticker:
    cik: int
    ticker: str
    name: str
    exchange: str               # normalized: NYSE | NASDAQ | AMEX | OTC
    sector: str | None = None
    industry: str | None = None
    market_cap: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Universe:
    as_of: str
    region: str
    source: str
    tickers: list[Ticker] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "as_of": self.as_of,
            "region": self.region,
            "source": self.source,
            "tickers": [t.to_dict() for t in self.tickers],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Universe":
        return cls(
            as_of=data.get("as_of", ""),
            region=data.get("region", "US"),
            source=data.get("source", ""),
            tickers=[Ticker(**t) for t in data.get("tickers", [])],
        )


# ---------------------------------------------------------------------------
# Fetch from SEC
# ---------------------------------------------------------------------------


def fetch_sec_tickers(*, user_agent: str | None = None, timeout: float = 30.0) -> list[Ticker]:
    """Pull the SEC's authoritative ticker file and return normalized rows.

    SEC requires a contact User-Agent on every request. We reuse the same
    ``COMPASS_SEC_USER_NAME`` / ``COMPASS_SEC_USER_EMAIL`` env vars
    EdgarSource uses so the user only has to set them once.
    """
    import requests  # local import — keeps the module importable without it

    name = os.environ.get("COMPASS_SEC_USER_NAME")
    email = os.environ.get("COMPASS_SEC_USER_EMAIL")
    ua = user_agent or (f"{name} {email}" if name and email else "Compass research")

    response = requests.get(
        SEC_TICKERS_URL,
        headers={"User-Agent": ua, "Accept": "application/json"},
        timeout=timeout,
    )
    response.raise_for_status()
    payload = response.json()
    return _parse_sec_payload(payload)


def _parse_sec_payload(payload: dict[str, Any]) -> list[Ticker]:
    """SEC's JSON is column-oriented: {"fields": [...], "data": [[...], ...]}.

    We translate to row-records, normalize exchange, and drop rows whose
    exchange isn't in our allow-list (NYSE / NASDAQ / AMEX).
    """
    fields: list[str] = payload.get("fields") or []
    rows: list[list[Any]] = payload.get("data") or []
    if not fields or not rows:
        return []

    idx = {name: i for i, name in enumerate(fields)}
    cik_col      = idx.get("cik")
    name_col     = idx.get("name")
    ticker_col   = idx.get("ticker")
    exchange_col = idx.get("exchange")
    if None in (cik_col, name_col, ticker_col, exchange_col):
        raise RuntimeError(
            f"SEC tickers payload missing expected columns. Got: {fields}"
        )

    out: list[Ticker] = []
    for row in rows:
        try:
            raw_exch = str(row[exchange_col] or "").strip()
            exch = _EXCHANGE_BUCKETS.get(raw_exch)
            if exch is None or exch not in ALLOWED_EXCHANGES:
                continue
            ticker = str(row[ticker_col] or "").strip().upper()
            name = str(row[name_col] or "").strip()
            if not ticker or not name:
                continue
            out.append(Ticker(
                cik=int(row[cik_col]),
                ticker=ticker,
                name=name,
                exchange=exch,
            ))
        except (TypeError, ValueError):
            continue
    return out


# ---------------------------------------------------------------------------
# Optional enrichment via yfinance
# ---------------------------------------------------------------------------


def enrich_with_yfinance(
    tickers: Iterable[Ticker],
    *,
    limit: int | None = 500,
    sleep_between: float = 0.15,
    on_progress: callable | None = None,
) -> list[Ticker]:
    """Fill in ``sector`` / ``industry`` / ``market_cap`` from yfinance.

    yfinance is rate-limited; we sleep briefly between calls and cap the
    number of tickers enriched by default (``limit=500``) to keep runtime
    bounded (~10 min). Unenrichable tickers keep their existing fields.

    Returns the same ``Ticker`` objects, mutated in place.
    """
    import yfinance as yf  # local import — yfinance pulls in pandas

    tickers = list(tickers)
    target = tickers if limit is None else tickers[:limit]

    for i, t in enumerate(target):
        try:
            info = yf.Ticker(t.ticker).info or {}
        except Exception:  # noqa: BLE001
            info = {}
        sector = info.get("sector")
        industry = info.get("industry")
        mcap = info.get("marketCap")
        if sector:   t.sector = str(sector)
        if industry: t.industry = str(industry)
        if isinstance(mcap, (int, float)) and mcap > 0:
            t.market_cap = float(mcap)
        if on_progress is not None:
            try:
                on_progress(i + 1, len(target), t)
            except Exception:  # noqa: BLE001
                pass
        if sleep_between > 0:
            time.sleep(sleep_between)

    return tickers


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------


def save_universe(universe: Universe, *, path: Path | None = None) -> Path:
    out = path or universe_path()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps(universe.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return out


def load_universe(*, path: Path | None = None) -> Universe | None:
    p = path or universe_path()
    if not p.exists():
        return None
    return Universe.from_dict(json.loads(p.read_text(encoding="utf-8")))


# ---------------------------------------------------------------------------
# High-level pipeline used by `compass refresh-universe`
# ---------------------------------------------------------------------------


def refresh(
    *,
    enrich_top: int | None = 500,
    on_progress: callable | None = None,
) -> Universe:
    """Fetch + optionally enrich + save. Returns the final Universe."""
    sec_rows = fetch_sec_tickers()
    if enrich_top is not None and enrich_top > 0:
        # Without market-cap data the order is whatever SEC returns, which
        # is roughly alphabetical-by-CIK. The first call has to enumerate
        # something — we enrich the first N from that order, then resort
        # the universe by market-cap-desc so the UI shows the most-followed
        # names first.
        enrich_with_yfinance(sec_rows, limit=enrich_top, on_progress=on_progress)
        sec_rows.sort(
            key=lambda t: (t.market_cap or 0.0),
            reverse=True,
        )
    universe = Universe(
        as_of=date.today().isoformat(),
        region="US",
        source="sec:company_tickers_exchange",
        tickers=sec_rows,
    )
    save_universe(universe)
    return universe


# ---------------------------------------------------------------------------
# Query helpers (used by the API)
# ---------------------------------------------------------------------------


def filter_tickers(
    universe: Universe,
    *,
    sector: str | None = None,
    exchange: str | None = None,
    query: str | None = None,
    limit: int = 500,
) -> list[Ticker]:
    """Cheap in-memory filter — case-insensitive substring on ticker + name."""
    rows = universe.tickers
    if sector:
        rows = [r for r in rows if (r.sector or "").lower() == sector.lower()]
    if exchange:
        rows = [r for r in rows if r.exchange.upper() == exchange.upper()]
    if query:
        q = query.strip().lower()
        if q:
            rows = [
                r for r in rows
                if q in r.ticker.lower() or q in r.name.lower()
            ]
    return rows[:limit]
