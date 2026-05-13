"""US ticker universe — parse the SEC payload, filter, round-trip on disk."""

from __future__ import annotations

import json

import pytest

from compass.universe import (
    ACTIVE_REGIONS,
    ALLOWED_EXCHANGES,
    CAP_BUCKETS,
    CAP_BUCKET_LABELS,
    GICS_SECTORS,
    NON_EQUITY_BUCKETS,
    REGIONS,
    Ticker,
    Universe,
    _parse_sec_payload,
    _score_query,
    classify_cap,
    classify_non_equity,
    filter_tickers,
    load_universe,
    normalize_sector,
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


def test_regions_include_eu_placeholder() -> None:
    assert "US" in REGIONS
    assert "EU" in REGIONS  # placeholder for the UI roadmap pill
    assert "US" in ACTIVE_REGIONS
    assert "EU" not in ACTIVE_REGIONS  # not populated yet


# --- cap-bucket classifier --------------------------------------------------


@pytest.mark.parametrize("cap,expected", [
    (5e12,    "blue-chip"),
    (200e9,   "blue-chip"),    # threshold inclusive
    (199e9,   "large"),
    (50e9,    "large"),
    (10e9,    "large"),
    (9e9,     "mid"),
    (2e9,     "mid"),
    (1.9e9,   "small"),
    (300e6,   "small"),
    (299e6,   "micro"),
    (1,       "micro"),
    (0,       None),
    (-1,      None),
    (None,    None),
])
def test_classify_cap_buckets(cap, expected) -> None:
    assert classify_cap(cap) == expected


def test_cap_buckets_constant_complete() -> None:
    assert CAP_BUCKETS == ("blue-chip", "large", "mid", "small", "micro")


def test_non_equity_buckets_constant_complete() -> None:
    assert NON_EQUITY_BUCKETS == ("etf", "preferred", "derivative", "other")


def test_every_bucket_has_a_label() -> None:
    for b in CAP_BUCKETS + NON_EQUITY_BUCKETS:
        assert b in CAP_BUCKET_LABELS, f"missing label for {b!r}"


# --- non-equity classifier --------------------------------------------------


@pytest.mark.parametrize("ticker,name,expected", [
    # Preferred shares — '-P' anywhere wins, including '-PA', '-PR', '-PH'.
    ("CMS-PB",   "CONSUMERS ENERGY CO",                 "preferred"),
    ("GAB-PH",   "GABELLI EQUITY TRUST",                "preferred"),
    ("C-PR",     "CITIGROUP INC",                        "preferred"),
    # Warrants (5+ chars ending W) — SPAC convention.
    ("ABCDW",    "Acme Corp Warrants",                   "derivative"),
    ("XYZAW",    "Some SPAC Warrants",                   "derivative"),
    # SPAC units.
    ("ABCDU",    "Acme Corp Units",                      "derivative"),
    # ETFs / funds via name.
    ("SPY",      "SPDR S&P 500 ETF TRUST",               "etf"),
    ("QQQ",      "INVESCO QQQ TRUST, SERIES 1",          "etf"),
    ("VOO",      "Vanguard S&P 500 ETF",                 "etf"),
    ("VTSAX",    "Vanguard Total Stock Market Index Fund","etf"),
    # Closed-end fund — Trust in name.
    ("BTO",      "JOHN HANCOCK FINANCIAL OPPORTUNITIES FUND", "etf"),
    # Everything else lands in 'other'.
    ("EAI",      "ENTERGY ARKANSAS, LLC",                "other"),
    ("AKO.B",    "ANDINA BOTTLING CO INC",               "other"),
])
def test_classify_non_equity(ticker, name, expected) -> None:
    assert classify_non_equity(ticker, name) == expected


def test_classify_non_equity_returns_other_for_blanks() -> None:
    assert classify_non_equity("AAPL", "") == "other"
    assert classify_non_equity("X", "Random Inc") == "other"


# --- Yahoo → GICS sector normalization --------------------------------------


@pytest.mark.parametrize("yahoo,expected", [
    ("Technology",         "Information Technology"),
    ("Healthcare",         "Health Care"),
    ("Financial Services", "Financials"),
    ("Consumer Cyclical",  "Consumer Discretionary"),
    ("Consumer Defensive", "Consumer Staples"),
    ("Basic Materials",    "Materials"),
    # Identity for sectors that already match GICS.
    ("Industrials",        "Industrials"),
    ("Energy",             "Energy"),
    ("Utilities",          "Utilities"),
    ("Real Estate",        "Real Estate"),
    ("Communication Services", "Communication Services"),
    # Pass-through for unknown.
    ("Something New",      "Something New"),
    (None,                 None),
    ("",                   None),
])
def test_normalize_sector(yahoo, expected) -> None:
    assert normalize_sector(yahoo) == expected


def test_normalize_sector_covers_every_yahoo_value_we_observe() -> None:
    """Every Yahoo sector name we've actually seen in the seed must map to
    one of the 11 GICS sectors — so the UI filter never silently 'no-ops'.
    Update both the mapping AND this list when yfinance starts returning
    a new sector name."""
    observed_yahoo_sectors = {
        "Technology", "Healthcare", "Financial Services", "Industrials",
        "Consumer Cyclical", "Real Estate", "Basic Materials",
        "Communication Services", "Energy", "Consumer Defensive", "Utilities",
    }
    for s in observed_yahoo_sectors:
        assert normalize_sector(s) in GICS_SECTORS, (
            f"Yahoo sector {s!r} doesn't normalize to a GICS sector"
        )


# --- search ranking ----------------------------------------------------------


def test_search_ranks_exact_ticker_highest() -> None:
    """Typing 'C' should put NYSE:C (Citigroup) before companies that
    merely contain 'c' somewhere in their name."""
    u = Universe(as_of="x", region="US", source="x", tickers=[
        Ticker(cik=1, ticker="C",    name="Citigroup Inc",       exchange="NYSE"),
        Ticker(cik=2, ticker="MSFT", name="Microsoft Corp",      exchange="NASDAQ"),
        Ticker(cik=3, ticker="CSCO", name="Cisco Systems",       exchange="NASDAQ"),
        Ticker(cik=4, ticker="AAPL", name="Apple Inc.",          exchange="NASDAQ"),
        Ticker(cik=5, ticker="GOOG", name="Alphabet Inc Class C", exchange="NASDAQ"),
    ])
    rows = filter_tickers(u, query="C")
    assert rows[0].ticker == "C"          # exact ticker match wins
    assert rows[1].ticker == "CSCO"        # ticker prefix
    # Word-start in name ('Citigroup', 'Cisco', 'Class C') — but 'Cisco'
    # was already matched higher via ticker prefix. Microsoft contains 'c'
    # mid-word; should come AFTER prefix matches.
    tickers_in_order = [r.ticker for r in rows]
    assert tickers_in_order.index("MSFT") > tickers_in_order.index("C")
    assert tickers_in_order.index("AAPL") > tickers_in_order.index("C")


def test_search_word_start_beats_substring() -> None:
    """Name word-start > ticker substring > name substring."""
    u = Universe(as_of="x", region="US", source="x", tickers=[
        Ticker(cik=1, ticker="XYZ",  name="Some other Beta Corp", exchange="NYSE"),    # name substring
        Ticker(cik=2, ticker="META", name="Meta Platforms",        exchange="NASDAQ"), # ticker substring
        Ticker(cik=3, ticker="ABC",  name="Eta Foods",             exchange="NYSE"),   # name starts-with
    ])
    rows = filter_tickers(u, query="eta")
    # name-start (300) > ticker-substring (50) > name-substring (10).
    assert [r.ticker for r in rows] == ["ABC", "META", "XYZ"]


def test_search_excludes_zero_score() -> None:
    u = Universe(as_of="x", region="US", source="x", tickers=[
        Ticker(cik=1, ticker="AAPL", name="Apple Inc.",       exchange="NASDAQ"),
        Ticker(cik=2, ticker="MSFT", name="Microsoft Corp",   exchange="NASDAQ"),
    ])
    rows = filter_tickers(u, query="zzzzz")
    assert rows == []


def test_score_query_thresholds() -> None:
    t = Ticker(cik=1, ticker="C", name="Citigroup Inc", exchange="NYSE")
    assert _score_query(t, "c") == 1000          # exact ticker
    t2 = Ticker(cik=2, ticker="CSCO", name="Cisco Systems", exchange="NASDAQ")
    assert _score_query(t2, "cs") == 500         # ticker prefix
    t3 = Ticker(cik=3, ticker="JPM", name="JPMorgan Chase", exchange="NYSE")
    assert _score_query(t3, "jp") == 500         # ticker prefix
    assert _score_query(t3, "chase") == 100      # name word-start
    assert _score_query(t3, "morg") == 10        # name substring only (mid-word)
    assert _score_query(t3, "zzzz") == 0         # no match at all


# --- cap_bucket filter -------------------------------------------------------


def test_filter_by_cap_bucket() -> None:
    u = Universe(as_of="x", region="US", source="x", tickers=[
        Ticker(cik=1, ticker="NVDA", name="Nvidia", exchange="NASDAQ", cap_bucket="blue-chip"),
        Ticker(cik=2, ticker="AMD",  name="AMD",    exchange="NASDAQ", cap_bucket="large"),
        Ticker(cik=3, ticker="SOC",  name="Sable",  exchange="NYSE",   cap_bucket="small"),
    ])
    rows = filter_tickers(u, cap_bucket="blue-chip")
    assert {r.ticker for r in rows} == {"NVDA"}


def test_from_dict_drops_legacy_market_cap_field() -> None:
    """Loading a JSON that still has the old numeric `market_cap` field
    doesn't crash and derives `cap_bucket` from it."""
    raw = {
        "as_of": "2026-05-13",
        "region": "US",
        "source": "x",
        "tickers": [
            {"cik": 1, "ticker": "NVDA", "name": "Nvidia",
             "exchange": "NASDAQ", "sector": None, "industry": None,
             "market_cap": 5e12},
        ],
    }
    u = Universe.from_dict(raw)
    assert u.tickers[0].cap_bucket == "blue-chip"
    # Old field should not appear on the new dataclass.
    assert not hasattr(u.tickers[0], "market_cap")
