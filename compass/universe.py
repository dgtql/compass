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

REGIONS: tuple[str, ...] = ("US", "EU")

# Which regions have data. EU is a roadmap placeholder for now — listed so
# the UI can show the chip but tickers come back empty until we have a
# European seed.
ACTIVE_REGIONS: tuple[str, ...] = ("US",)


# ---------------------------------------------------------------------------
# Market-cap buckets (categorical, static)
# ---------------------------------------------------------------------------
#
# A company crosses these thresholds maybe once a decade, so we compute the
# bucket *once* (at enrichment time) and freeze it. The UI filters by
# bucket; the numeric market-cap field is omitted from API responses so
# it doesn't confuse anyone into thinking it's live.

CAP_BUCKETS: tuple[str, ...] = ("blue-chip", "large", "mid", "small", "micro")

CAP_BUCKET_LABELS: dict[str, str] = {
    "blue-chip": "Blue chip",
    "large":     "Large cap",
    "mid":       "Mid cap",
    "small":     "Small cap",
    "micro":     "Micro cap",
}


def classify_cap(market_cap_usd: float | None) -> str | None:
    """Categorize a market cap into a static bucket. Thresholds are conventional:

    * Blue chip / mega cap: >= $200B
    * Large cap:            $10B  – $200B
    * Mid cap:              $2B   – $10B
    * Small cap:            $300M – $2B
    * Micro cap:            < $300M

    Returns None if ``market_cap_usd`` is missing or non-positive.
    """
    if market_cap_usd is None:
        return None
    try:
        v = float(market_cap_usd)
    except (TypeError, ValueError):
        return None
    if v <= 0:
        return None
    if v >= 200e9: return "blue-chip"
    if v >= 10e9:  return "large"
    if v >= 2e9:   return "mid"
    if v >= 300e6: return "small"
    return "micro"

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
    cap_bucket: str | None = None   # blue-chip | large | mid | small | micro

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
        # Filter to known Ticker fields so legacy seed files (e.g. those that
        # still carry numeric `market_cap`) load cleanly. Migration to
        # `cap_bucket` happens at enrichment time, not at load time.
        keep = set(Ticker.__dataclass_fields__)
        tickers = []
        for raw in data.get("tickers", []):
            kwargs = {k: v for k, v in raw.items() if k in keep}
            # Honour a legacy numeric market_cap by deriving the bucket.
            if "cap_bucket" not in raw and isinstance(raw.get("market_cap"), (int, float)):
                kwargs.setdefault("cap_bucket", classify_cap(raw["market_cap"]))
            tickers.append(Ticker(**kwargs))
        return cls(
            as_of=data.get("as_of", ""),
            region=data.get("region", "US"),
            source=data.get("source", ""),
            tickers=tickers,
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
    checkpoint_every: int = 50,
    universe_for_checkpoint: "Universe | None" = None,
) -> list[Ticker]:
    """Fill in ``sector`` / ``industry`` / ``cap_bucket`` from yfinance.

    yfinance is rate-limited; we sleep briefly between calls and cap the
    number of tickers enriched by default (``limit=500``) to keep runtime
    bounded (~10 min). Unenrichable tickers keep their existing fields.

    The numeric market cap from yfinance is *only* used to compute
    ``cap_bucket`` (categorical, static); the raw number isn't stored
    because it goes stale within a day and we don't want stale numbers
    in the UI.

    Pass ``universe_for_checkpoint`` to persist partial progress every
    ``checkpoint_every`` tickers — useful for long crawls so a rate-limit
    or network hiccup doesn't lose all progress.

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
        bucket = classify_cap(mcap)
        if bucket:
            t.cap_bucket = bucket
        if on_progress is not None:
            try:
                on_progress(i + 1, len(target), t)
            except Exception:  # noqa: BLE001
                pass
        # Checkpoint periodically so a long crawl can resume from disk.
        if (
            universe_for_checkpoint is not None
            and checkpoint_every > 0
            and (i + 1) % checkpoint_every == 0
        ):
            try:
                save_universe(universe_for_checkpoint)
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
    universe = Universe(
        as_of=date.today().isoformat(),
        region="US",
        source="sec:company_tickers_exchange",
        tickers=sec_rows,
    )
    if enrich_top is not None and enrich_top > 0:
        enrich_with_yfinance(
            sec_rows,
            limit=enrich_top,
            on_progress=on_progress,
            universe_for_checkpoint=universe,
        )
        # Bring blue-chips to the top, then large, mid, small, micro, then
        # unenriched. Within a bucket the SEC order is roughly by filings
        # activity, which is a decent proxy for "how often does anyone
        # touch this name".
        rank = {b: i for i, b in enumerate(CAP_BUCKETS)}
        sec_rows.sort(key=lambda t: rank.get(t.cap_bucket or "", 99))
    save_universe(universe)
    return universe


def enrich_existing(
    *,
    start: int = 0,
    limit: int | None = None,
    on_progress: callable | None = None,
) -> Universe:
    """Top up enrichment on an already-saved seed without re-fetching SEC.

    Useful when extending coverage beyond the current top-N enriched —
    re-running ``refresh()`` would re-fetch from SEC unnecessarily. Loads
    the on-disk universe, skips already-enriched rows (those with
    ``cap_bucket`` set), and runs yfinance on the next slice.
    """
    universe = load_universe()
    if universe is None:
        raise RuntimeError("no universe seed yet — run `compass refresh-universe` first.")
    pending = [t for t in universe.tickers if t.cap_bucket is None][start:]
    if limit is not None:
        pending = pending[:limit]
    enrich_with_yfinance(
        pending,
        limit=None,
        on_progress=on_progress,
        universe_for_checkpoint=universe,
    )
    rank = {b: i for i, b in enumerate(CAP_BUCKETS)}
    universe.tickers.sort(key=lambda t: rank.get(t.cap_bucket or "", 99))
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
    cap_bucket: str | None = None,
    query: str | None = None,
) -> list[Ticker]:
    """Filter ``universe.tickers`` by category fields + rank by query relevance.

    Returns *all* matching rows (no pagination). Callers slice with
    ``offset`` + ``limit`` for paged display — the FastAPI endpoint does
    this so the UI can render a "page N of M" footer that knows the true
    match count.

    Search ranking: when ``query`` is given, results are sorted by how
    closely the query matches a ticker / name — exact ticker match first,
    then ticker prefix, then name word-start, then substring. Typing
    ``"C"`` lands JPMorgan ticker ``"C"`` (Citigroup) at the top, not the
    long list of names that happen to contain a 'c'.
    """
    rows = universe.tickers
    if sector:
        rows = [r for r in rows if (r.sector or "").lower() == sector.lower()]
    if exchange:
        rows = [r for r in rows if r.exchange.upper() == exchange.upper()]
    if cap_bucket:
        rows = [r for r in rows if (r.cap_bucket or "") == cap_bucket.lower()]
    if query:
        q = query.strip()
        if q:
            scored = [(r, _score_query(r, q)) for r in rows]
            kept = [(r, s) for r, s in scored if s > 0]
            kept.sort(key=lambda rs: (-rs[1], rs[0].ticker))
            rows = [r for r, _ in kept]
    return rows


def _score_query(t: Ticker, query: str) -> int:
    """Higher score = better match. 0 means no match (filtered out).

    Tiers:
    * 1000 — ticker == query (exact)
    * 500  — ticker starts with query
    * 300  — name starts with query
    * 100  — any word of name starts with query (e.g. "C" → "Citigroup")
    * 50   — query is a substring of the ticker
    * 10   — query is a substring of the name
    """
    ql = query.lower()
    tl = t.ticker.lower()
    nl = t.name.lower()
    if tl == ql:
        return 1000
    if tl.startswith(ql):
        return 500
    if nl.startswith(ql):
        return 300
    # Word-start match — handles "C" → "Citigroup Inc." and so on.
    for word in nl.replace(",", " ").replace(".", " ").split():
        if word.startswith(ql):
            return 100
    if ql in tl:
        return 50
    if ql in nl:
        return 10
    return 0
