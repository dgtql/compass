"""Analyst roster — create / list / delete / coverage updates."""

from __future__ import annotations

import json

import pytest

from compass.analysts import (
    Analyst,
    AnalystStats,
    Roster,
    _initials,
    _pick_color,
    _slugify,
    _unique_slug,
    create_analyst,
    delete_analyst,
    get_analyst,
    list_analysts,
    load_roster,
    save_roster,
    update_analyst_coverage,
)


@pytest.fixture
def data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return tmp_path


# --- slug / initials / color ------------------------------------------------


@pytest.mark.parametrize("name,expected", [
    ("Maria Chen",        "maria-chen"),
    ("MARIA CHEN",        "maria-chen"),
    ("Pierre-Louis Roux", "pierre-louis-roux"),
    ("  Maria   Chen ",   "maria-chen"),
    ("",                  "analyst"),
    ("@#$%",              "analyst"),
])
def test_slugify(name, expected) -> None:
    assert _slugify(name) == expected


def test_unique_slug_dedupes() -> None:
    roster = Roster(as_of="x", analysts=[
        Analyst(id="a1", slug="maria-chen", name="Maria Chen", title="t", sector="Information Technology"),
    ])
    assert _unique_slug("Maria Chen", roster) == "maria-chen-2"
    roster.analysts.append(Analyst(id="a2", slug="maria-chen-2", name="Maria Chen", title="t", sector="Information Technology"))
    assert _unique_slug("Maria Chen", roster) == "maria-chen-3"


@pytest.mark.parametrize("name,expected", [
    ("Maria Chen",      "MC"),
    ("David Park Jr.",  "DJ"),
    ("Aisha",           "AI"),
    ("",                "??"),
])
def test_initials(name, expected) -> None:
    assert _initials(name) == expected


def test_pick_color_deterministic() -> None:
    # Same slug → same color across calls.
    assert _pick_color("maria-chen") == _pick_color("maria-chen")
    # Different slugs likely pick different palette entries.
    colors = {_pick_color(s) for s in ("maria-chen", "david-park", "aisha-patel", "tom-kovacs")}
    assert len(colors) >= 2  # not all the same


# --- create / list / delete -------------------------------------------------


def test_create_persists_to_disk(data_dir, monkeypatch) -> None:
    # Bypass universe validation — tests don't need the seed.
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    analyst = create_analyst(
        name="Maria Chen",
        sector="Information Technology",
        coverage=[],
        persona="quant-leaning semis",
    )
    assert analyst.slug == "maria-chen"
    assert analyst.title == "Analyst · Information Technology"
    assert analyst.avatar_initials == "MC"
    assert analyst.status == "idle"
    assert analyst.stats.memos == 0

    # Persisted on disk.
    p = data_dir / "analysts.json"
    raw = json.loads(p.read_text(encoding="utf-8"))
    assert len(raw["analysts"]) == 1
    assert raw["analysts"][0]["slug"] == "maria-chen"


def test_create_assigns_unique_slugs(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    a = create_analyst(name="Maria Chen", sector="Information Technology")
    b = create_analyst(name="Maria Chen", sector="Information Technology")
    assert a.slug == "maria-chen"
    assert b.slug == "maria-chen-2"


def test_create_rejects_bad_sector(data_dir) -> None:
    with pytest.raises(ValueError, match="sector"):
        create_analyst(name="X", sector="Not A GICS Sector")


def test_create_rejects_empty_name(data_dir) -> None:
    with pytest.raises(ValueError, match="name"):
        create_analyst(name="  ", sector="Information Technology")


def test_create_validates_coverage_against_universe(data_dir, monkeypatch) -> None:
    from compass.universe import Ticker, Universe
    fake = Universe(as_of="x", region="US", source="test", tickers=[
        Ticker(cik=1, ticker="NVDA", name="Nvidia", exchange="NASDAQ"),
    ])
    monkeypatch.setattr("compass.universe.load_universe", lambda: fake)

    # NVDA is in the fake universe → ok.
    create_analyst(name="Maria", sector="Information Technology", coverage=["NVDA"])
    # FAKE is not → 400.
    with pytest.raises(ValueError, match="unknown tickers"):
        create_analyst(name="Other", sector="Information Technology", coverage=["FAKE"])


def test_create_skips_validation_when_universe_missing_and_validate_off(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    a = create_analyst(
        name="Maria",
        sector="Information Technology",
        coverage=["NVDA", "AMD"],
        validate_coverage=False,
    )
    assert a.coverage == ["NVDA", "AMD"]


def test_create_normalizes_coverage(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    a = create_analyst(
        name="Maria",
        sector="Information Technology",
        coverage=["nvda", "AMD", "  intc  ", "AMD"],  # dupe + casing + whitespace
        validate_coverage=False,
    )
    assert a.coverage == ["NVDA", "AMD", "INTC"]


def test_list_returns_roster(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    create_analyst(name="Maria Chen", sector="Information Technology")
    create_analyst(name="David Park", sector="Energy")
    items = list_analysts()
    assert {a.slug for a in items} == {"maria-chen", "david-park"}


def test_get_returns_analyst_or_none(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    create_analyst(name="Maria Chen", sector="Information Technology")
    assert get_analyst("maria-chen") is not None
    assert get_analyst("nobody") is None


def test_delete_removes(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    create_analyst(name="Maria Chen", sector="Information Technology")
    delete_analyst("maria-chen")
    assert get_analyst("maria-chen") is None


def test_delete_is_idempotent(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    roster = delete_analyst("nobody")
    assert roster.analysts == []


# --- coverage updates -------------------------------------------------------


def test_update_coverage_replaces(data_dir, monkeypatch) -> None:
    from compass.universe import Ticker, Universe
    fake = Universe(as_of="x", region="US", source="test", tickers=[
        Ticker(cik=1, ticker="NVDA", name="Nvidia", exchange="NASDAQ"),
        Ticker(cik=2, ticker="AMD",  name="AMD",    exchange="NASDAQ"),
    ])
    monkeypatch.setattr("compass.universe.load_universe", lambda: fake)
    create_analyst(name="Maria", sector="Information Technology", coverage=["NVDA"])
    updated = update_analyst_coverage("maria", ["NVDA", "AMD"])
    assert updated.coverage == ["NVDA", "AMD"]


def test_update_coverage_unknown_analyst_raises(data_dir, monkeypatch) -> None:
    monkeypatch.setattr("compass.universe.load_universe", lambda: None)
    with pytest.raises(ValueError, match="analyst not found"):
        update_analyst_coverage("nobody", ["NVDA"], validate=False)
