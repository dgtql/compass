"""My Universe — the PM's personal watchlist of tickers.

A small, mutable subset of the read-only US universe (``compass.universe``).
The PM picks tickers from the catalog and adds them here; the watchlist
becomes the working set for hiring analysts, opening engagements, and
running templates.

Storage is a single JSON file at ``data/my-universe.json`` (per-user, not
shipped with the package). Schema::

    {
      "as_of":  "2026-05-13T10:25:00Z",
      "tickers": [
        {
          "ticker": "NVDA",
          "added_at": "2026-05-13T08:00:00Z",
          "note": null
        }
      ]
    }

We deliberately store *just the ticker symbol* (plus when it was added
and an optional note). All the static metadata — name, exchange, sector,
market cap — comes from the universe. This keeps the watchlist file tiny
and avoids stale fields when the universe is refreshed.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def watchlist_path() -> Path:
    """Where the watchlist lives on disk (per-user; honours COMPASS_DATA_DIR)."""
    base = Path(os.environ.get("COMPASS_DATA_DIR", "data")).resolve()
    return base / "my-universe.json"


@dataclass
class WatchlistEntry:
    ticker: str
    added_at: str
    note: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class Watchlist:
    as_of: str
    tickers: list[WatchlistEntry] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "as_of": self.as_of,
            "tickers": [t.to_dict() for t in self.tickers],
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "Watchlist":
        return cls(
            as_of=data.get("as_of", ""),
            tickers=[WatchlistEntry(**t) for t in data.get("tickers", [])],
        )

    def has(self, ticker: str) -> bool:
        upper = ticker.upper()
        return any(t.ticker == upper for t in self.tickers)


# ---------------------------------------------------------------------------
# I/O
# ---------------------------------------------------------------------------


def load_watchlist(*, path: Path | None = None) -> Watchlist:
    """Read the watchlist (empty list if file is missing)."""
    p = path or watchlist_path()
    if not p.exists():
        return Watchlist(as_of=_now_iso(), tickers=[])
    return Watchlist.from_dict(json.loads(p.read_text(encoding="utf-8")))


def save_watchlist(watchlist: Watchlist, *, path: Path | None = None) -> Path:
    p = path or watchlist_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    watchlist.as_of = _now_iso()
    p.write_text(
        json.dumps(watchlist.to_dict(), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return p


# ---------------------------------------------------------------------------
# Mutations (used by both the CLI and the API)
# ---------------------------------------------------------------------------


def add_ticker(
    ticker: str,
    *,
    note: str | None = None,
    path: Path | None = None,
    validate_against_universe: bool = True,
) -> Watchlist:
    """Add ``ticker`` to the watchlist. No-op if already present.

    When ``validate_against_universe`` is True (default), the ticker must
    exist in ``compass/data/universe/us-tickers.json``. Set False for tests
    or for adding unlisted symbols.
    """
    upper = ticker.strip().upper()
    if not upper:
        raise ValueError("ticker is required")

    if validate_against_universe:
        from compass.universe import load_universe  # local import: avoids cycle
        universe = load_universe()
        if universe is None:
            raise RuntimeError(
                "universe seed missing — run `compass refresh-universe` first."
            )
        if not any(t.ticker == upper for t in universe.tickers):
            raise ValueError(
                f"{upper} is not in the universe. "
                f"Run `compass universe --query {upper.lower()}` to check spelling."
            )

    wl = load_watchlist(path=path)
    if wl.has(upper):
        return wl
    wl.tickers.append(WatchlistEntry(
        ticker=upper,
        added_at=_now_iso(),
        note=note,
    ))
    # Stable order: newest-first looks right in the UI.
    wl.tickers.sort(key=lambda t: t.added_at, reverse=True)
    save_watchlist(wl, path=path)
    return wl


def remove_ticker(ticker: str, *, path: Path | None = None) -> Watchlist:
    """Remove ``ticker`` from the watchlist. No-op if not present."""
    upper = ticker.strip().upper()
    wl = load_watchlist(path=path)
    before = len(wl.tickers)
    wl.tickers = [t for t in wl.tickers if t.ticker != upper]
    if len(wl.tickers) != before:
        save_watchlist(wl, path=path)
    return wl


# ---------------------------------------------------------------------------
# Hydration — combine watchlist entries with universe metadata
# ---------------------------------------------------------------------------


def hydrate(watchlist: Watchlist) -> list[dict[str, Any]]:
    """Return rich rows for the UI: watchlist entry + matching universe fields.

    Missing universe entries (e.g. after refreshing and a ticker was
    delisted) still get a row with `ticker` + `added_at` only.
    """
    from compass.universe import load_universe

    universe = load_universe()
    by_ticker: dict[str, dict[str, Any]] = {}
    if universe is not None:
        for t in universe.tickers:
            by_ticker[t.ticker] = t.to_dict()

    rows: list[dict[str, Any]] = []
    for entry in watchlist.tickers:
        u = by_ticker.get(entry.ticker, {})
        rows.append({
            "ticker": entry.ticker,
            "added_at": entry.added_at,
            "note": entry.note,
            # Universe-derived fields (may be empty if ticker not in universe).
            "name": u.get("name"),
            "exchange": u.get("exchange"),
            "sector": u.get("sector"),
            "industry": u.get("industry"),
            "cap_bucket": u.get("cap_bucket"),
            "cik": u.get("cik"),
        })
    return rows


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
