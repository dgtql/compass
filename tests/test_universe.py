"""US ticker universe — parse the SEC payload, filter, round-trip on disk."""

from __future__ import annotations

import json

import pytest

from compass.universe import (
    ALLOWED_EXCHANGES,
    GICS_SECTORS,
    REGIONS,
    Ticker,
    Universe,
    _parse_sec_payload,
    filter_tickers,
    load_universe,
    save_universe,
)


# Tiny synthetic SEC payload that exercises every code path we care about.
_FAKE_SEC_PAYLOAD = {
    "fields": ["cik", "name", "ticker", "exchange"],
    "data": [
        [320193,    "Apple Inc.",            "AAPL",  "Nasdaq"],
        [1018724,   "Amazon.com Inc.",       "AMZN",  "Nasdaq"],
        [1045810,   "Nvidia Corp.",          "NVDA",  "Nasdaq"],
        [320187,    "Nike Inc.",             "NKE",   "NYSE"],
        [12,        "Mystery OTC Corp",      "MYST",  "OTC"],          # filtered out
        [99,        "Pink Sheet Co",         "PNK",   "Pink Sheets"],  # filtered out
        [777,       "Empty Ticker Filer",    "",      "NYSE"],         # filtered (empty ticker)
        [888,       "",                      "EMPTY", "NYSE"],         # filtered (empty name)
        [555,       "American Co",           "AMC",   "NYSE American"],# AMEX bucket
        [None,      "Broken Row",            "BAD",   "NYSE"],         # filtered (bad cik)
    ],
}


def test_parse_drops_unsupported_exchanges_and_empty_rows() -> None:
    rows = _parse_sec_payload(_FAKE_SEC_PAYLOAD)
    tickers = {r.ticker for r in rows}
    # Kept: NYSE / NASDAQ / NYSE American → AMEX.
    assert {"AAPL", "AMZN", "NVDA", "NKE", "AMC"}.issubset(tickers)
    # Dropped: OTC / Pink Sheets / empty values / non-integer CIK.
    assert "MYST" not in tickers
    assert "PNK" not in tickers
    assert "EMPTY" not in tickers
    assert "BAD" not in tickers


def test_parse_buckets_exchange_to_canonical() -> None:
    rows = _parse_sec_payload(_FAKE_SEC_PAYLOAD)
    by_ticker = {r.ticker: r for r in rows}
    assert by_ticker["AAPL"].exchange == "NASDAQ"
    assert by_ticker["NKE"].exchange == "NYSE"
    assert by_ticker["AMC"].exchange == "AMEX"


def test_parse_uppercases_ticker_keeps_name_as_is() -> None:
    rows = _parse_sec_payload(_FAKE_SEC_PAYLOAD)
    by_ticker = {r.ticker: r for r in rows}
    assert by_ticker["AAPL"].name == "Apple Inc."


def test_parse_handles_empty_payload() -> None:
    assert _parse_sec_payload({}) == []
    assert _parse_sec_payload({"fields": [], "data": []}) == []


def test_parse_raises_on_missing_required_columns() -> None:
    with pytest.raises(RuntimeError):
        _parse_sec_payload({
            "fields": ["cik", "name"],  # missing ticker + exchange
            "data": [[1, "X"]],
        })


# --- filtering ---------------------------------------------------------------


def _make_universe() -> Universe:
    return Universe(
        as_of="2026-05-13",
        region="US",
        source="test",
        tickers=[
            Ticker(cik=1, ticker="AAPL", name="Apple Inc.",   exchange="NASDAQ", sector="Information Technology"),
            Ticker(cik=2, ticker="NVDA", name="Nvidia Corp.", exchange="NASDAQ", sector="Information Technology"),
            Ticker(cik=3, ticker="JPM",  name="JPMorgan",     exchange="NYSE",   sector="Financials"),
            Ticker(cik=4, ticker="XOM",  name="Exxon Mobil",  exchange="NYSE",   sector="Energy"),
            Ticker(cik=5, ticker="UNH",  name="UnitedHealth", exchange="NYSE"),  # no sector → tests filter on missing field
        ],
    )


def test_filter_by_sector_case_insensitive() -> None:
    u = _make_universe()
    rows = filter_tickers(u, sector="information technology")
    assert {r.ticker for r in rows} == {"AAPL", "NVDA"}


def test_filter_by_exchange() -> None:
    u = _make_universe()
    rows = filter_tickers(u, exchange="nyse")
    assert {r.ticker for r in rows} == {"JPM", "XOM", "UNH"}


def test_filter_by_query_matches_ticker_or_name() -> None:
    u = _make_universe()
    by_ticker = filter_tickers(u, query="nvd")
    assert [r.ticker for r in by_ticker] == ["NVDA"]
    by_name = filter_tickers(u, query="Morgan")
    assert [r.ticker for r in by_name] == ["JPM"]


def test_filter_combined() -> None:
    u = _make_universe()
    rows = filter_tickers(u, sector="Information Technology", query="A")
    assert {r.ticker for r in rows} == {"AAPL", "NVDA"}


def test_filter_limit() -> None:
    u = _make_universe()
    rows = filter_tickers(u, limit=2)
    assert len(rows) == 2


def test_filter_no_match_returns_empty() -> None:
    u = _make_universe()
    rows = filter_tickers(u, sector="Utilities")
    assert rows == []


# --- I/O round-trip ----------------------------------------------------------


def test_save_and_load_roundtrip(tmp_path) -> None:
    original = _make_universe()
    out = tmp_path / "u.json"
    save_universe(original, path=out)
    loaded = load_universe(path=out)
    assert loaded is not None
    assert loaded.as_of == "2026-05-13"
    assert loaded.region == "US"
    assert {t.ticker for t in loaded.tickers} == {"AAPL", "NVDA", "JPM", "XOM", "UNH"}


def test_load_missing_returns_none(tmp_path) -> None:
    assert load_universe(path=tmp_path / "nope.json") is None


def test_save_emits_valid_json(tmp_path) -> None:
    out = tmp_path / "u.json"
    save_universe(_make_universe(), path=out)
    parsed = json.loads(out.read_text(encoding="utf-8"))
    assert parsed["region"] == "US"
    assert isinstance(parsed["tickers"], list)


# --- taxonomy guards ---------------------------------------------------------


def test_gics_sectors_have_eleven() -> None:
    # GICS has had 11 sectors since 2016. If this changes upstream we want to
    # know.
    assert len(GICS_SECTORS) == 11


def test_allowed_exchanges_known() -> None:
    assert set(ALLOWED_EXCHANGES) == {"NYSE", "NASDAQ", "AMEX"}


def test_us_is_only_region() -> None:
    assert REGIONS == ("US",)
