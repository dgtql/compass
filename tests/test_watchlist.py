"""My Universe (watchlist) — add / remove / hydrate against the universe."""

from __future__ import annotations

import json

import pytest

from compass.watchlist import (
    Watchlist,
    WatchlistEntry,
    add_ticker,
    hydrate,
    load_watchlist,
    remove_ticker,
    save_watchlist,
)


@pytest.fixture
def wl_path(tmp_path, monkeypatch):
    """Redirect the watchlist to a per-test temp file."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return tmp_path / "my-universe.json"


def test_load_missing_returns_empty(wl_path) -> None:
    wl = load_watchlist()
    assert wl.tickers == []
    assert wl.as_of  # populated with current time


def test_add_persists_to_disk(wl_path) -> None:
    wl = add_ticker("NVDA", validate_against_universe=False)
    assert wl.has("NVDA")
    assert wl_path.exists()
    on_disk = json.loads(wl_path.read_text(encoding="utf-8"))
    assert on_disk["tickers"][0]["ticker"] == "NVDA"


def test_add_normalizes_to_upper(wl_path) -> None:
    wl = add_ticker("nvda", validate_against_universe=False)
    assert wl.tickers[0].ticker == "NVDA"


def test_add_is_idempotent(wl_path) -> None:
    add_ticker("NVDA", validate_against_universe=False)
    add_ticker("NVDA", validate_against_universe=False)
    wl = load_watchlist()
    assert len([t for t in wl.tickers if t.ticker == "NVDA"]) == 1


def test_add_rejects_empty(wl_path) -> None:
    with pytest.raises(ValueError):
        add_ticker("", validate_against_universe=False)


def test_remove_removes(wl_path) -> None:
    add_ticker("NVDA", validate_against_universe=False)
    add_ticker("SOC", validate_against_universe=False)
    remove_ticker("NVDA")
    wl = load_watchlist()
    assert not wl.has("NVDA")
    assert wl.has("SOC")


def test_remove_is_idempotent(wl_path) -> None:
    wl = remove_ticker("NOT_THERE")
    assert wl.tickers == []


def test_note_persists(wl_path) -> None:
    add_ticker("NVDA", note="track AVGO networking", validate_against_universe=False)
    wl = load_watchlist()
    assert wl.tickers[0].note == "track AVGO networking"


def test_add_validates_against_universe(wl_path, monkeypatch) -> None:
    """When validate_against_universe is True, unknown tickers should raise."""
    # Patch load_universe to return a tiny universe.
    from compass.universe import Ticker, Universe
    fake = Universe(
        as_of="2026-05-13",
        region="US",
        source="test",
        tickers=[Ticker(cik=1, ticker="NVDA", name="Nvidia", exchange="NASDAQ")],
    )
    monkeypatch.setattr("compass.universe.load_universe", lambda: fake)
    # Re-import the watchlist module's reference too (it does local import).
    import compass.watchlist as wlmod
    monkeypatch.setattr(wlmod, "_now_iso", lambda: "2026-05-13T00:00:00Z")

    add_ticker("NVDA")  # ok — in universe
    with pytest.raises(ValueError, match="not in the universe"):
        add_ticker("FAKE_TICKER_XYZ")


def test_hydrate_combines_watchlist_with_universe(wl_path, monkeypatch) -> None:
    from compass.universe import Ticker, Universe
    fake = Universe(
        as_of="2026-05-13",
        region="US",
        source="test",
        tickers=[
            Ticker(cik=1, ticker="NVDA", name="Nvidia",  exchange="NASDAQ", sector="Tech",     market_cap=5e12),
            Ticker(cik=2, ticker="SOC",  name="Sable",   exchange="NYSE",   sector="Energy",   market_cap=2e9),
        ],
    )
    monkeypatch.setattr("compass.universe.load_universe", lambda: fake)

    save_watchlist(Watchlist(
        as_of="2026-05-13T00:00:00Z",
        tickers=[
            WatchlistEntry(ticker="NVDA", added_at="2026-05-13T00:00:00Z", note="N"),
            WatchlistEntry(ticker="SOC",  added_at="2026-05-12T00:00:00Z", note=None),
        ],
    ))
    rows = hydrate(load_watchlist())
    by_ticker = {r["ticker"]: r for r in rows}
    assert by_ticker["NVDA"]["sector"] == "Tech"
    assert by_ticker["NVDA"]["market_cap"] == 5e12
    assert by_ticker["NVDA"]["note"] == "N"
    assert by_ticker["SOC"]["industry"] is None  # not set in the fake universe


def test_hydrate_handles_ticker_not_in_universe(wl_path, monkeypatch) -> None:
    from compass.universe import Universe
    fake = Universe(as_of="2026-05-13", region="US", source="test", tickers=[])
    monkeypatch.setattr("compass.universe.load_universe", lambda: fake)

    save_watchlist(Watchlist(
        as_of="2026-05-13T00:00:00Z",
        tickers=[WatchlistEntry(ticker="DELISTED", added_at="2026-05-13T00:00:00Z")],
    ))
    rows = hydrate(load_watchlist())
    assert rows[0]["ticker"] == "DELISTED"
    assert rows[0]["name"] is None
    assert rows[0]["sector"] is None


def test_add_sorts_newest_first(wl_path) -> None:
    """Adding multiple tickers preserves newest-added-first ordering."""
    import time
    add_ticker("A", validate_against_universe=False)
    time.sleep(0.01)  # ensure distinct timestamps
    add_ticker("B", validate_against_universe=False)
    time.sleep(0.01)
    add_ticker("C", validate_against_universe=False)
    wl = load_watchlist()
    assert [t.ticker for t in wl.tickers] == ["C", "B", "A"]
