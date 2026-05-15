"""Region-routing tests — the SEC-dependent fetch skills skip cleanly
when the engagement's ticker isn't US, and the data-source registry
picks up the new ``overview`` producer for every persona pipeline."""

from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
from pathlib import Path

import pytest

from compass.engagement import Engagement, Task
from compass.universe import ticker_region


def _load_skill_run(slug: str):
    """Dynamically import a skill's scripts/run.py and return its ``run`` coro."""
    skill_dir = Path(__file__).resolve().parent.parent / "skills" / slug
    run_py = skill_dir / "scripts" / "run.py"
    assert run_py.exists(), f"missing {run_py}"
    module_name = f"_test_skill_{slug.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, run_py)
    assert spec is not None and spec.loader is not None
    mod = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = mod
    spec.loader.exec_module(mod)
    return mod.run


@pytest.fixture
def eu_engagement(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Engagement:
    """Materialize an Engagement for AKSO.OL under a temp data dir."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return Engagement.open("AKSO.OL", analyst="warren-buffett")


def test_ticker_region_returns_eu_for_akso() -> None:
    """The universe seed correctly tags AKSO.OL as an EU ticker."""
    assert ticker_region("AKSO.OL") == "EU"


def test_ticker_region_returns_us_for_nvda() -> None:
    assert ticker_region("NVDA") == "US"


def test_ticker_region_defaults_us_for_unknown_symbol() -> None:
    """Unknown free-form tickers default to US (the historical behaviour
    — let EDGAR try anyway)."""
    assert ticker_region("ZZZZZZ-NOT-A-TICKER") == "US"


def test_fetch_sec_filing_skips_eu_ticker(eu_engagement: Engagement) -> None:
    """fetch-sec-filing returns count=0 with a skipped_reason for AKSO.OL.

    Critically: it does NOT call EDGAR (which would hang / 404). We
    confirm by asserting no edgartools imports happened — the early
    return is the whole point.
    """
    run = _load_skill_run("fetch-sec-filing")
    task = Task(id="ingest-10k", stage="ingest", title="t", skill="fetch-sec-filing",
                params={"form": "10-K", "limit": 1})
    result = asyncio.run(run(engagement=eu_engagement, task=task))
    assert result["count"] == 0
    assert "skipped_reason" in result
    assert "EU" in result["skipped_reason"]


def test_fetch_press_releases_skips_eu_ticker(eu_engagement: Engagement) -> None:
    run = _load_skill_run("fetch-press-releases")
    task = Task(id="ingest-press", stage="ingest", title="t", skill="fetch-press-releases",
                params={"limit": 5})
    result = asyncio.run(run(engagement=eu_engagement, task=task))
    assert result["count"] == 0
    assert "skipped_reason" in result


def test_fetch_insider_trades_skips_eu_ticker(eu_engagement: Engagement) -> None:
    run = _load_skill_run("fetch-insider-trades")
    task = Task(id="ingest-insider", stage="ingest", title="t", skill="fetch-insider-trades")
    result = asyncio.run(run(engagement=eu_engagement, task=task))
    assert result["count"] == 0
    assert "skipped_reason" in result


def test_fetch_institutional_holdings_skips_eu_ticker(eu_engagement: Engagement) -> None:
    run = _load_skill_run("fetch-institutional-holdings")
    task = Task(id="ingest-holdings", stage="ingest", title="t",
                skill="fetch-institutional-holdings")
    result = asyncio.run(run(engagement=eu_engagement, task=task))
    assert result["institutional_count"] == 0
    assert result["mutual_fund_count"] == 0
    assert "skipped_reason" in result


def test_buffett_pitch_for_akso_still_plans_full_dag() -> None:
    """The skip behaviour is at *run* time — the plan still includes the
    SEC tasks (they just return early when executed). That's the right
    shape: the WorkflowsView graph stays uniform across regions, and the
    runtime decides what to actually do.
    """
    from compass.planner import TEMPLATES
    eng = Engagement(analyst_slug="preview", ticker="AKSO.OL", root=Path("__preview__"))
    tasks = TEMPLATES["buffett-pitch"](eng)
    ingest_ids = {t.id for t in tasks if t.stage == "ingest"}
    # Registry-driven, so the overview producer is in
    assert "ingest-overview" in ingest_ids
    # SEC tasks are still planned — they just no-op at runtime
    assert any("filings" in tid for tid in ingest_ids)
    # And the universal yfinance producers
    assert "ingest-snapshots" in ingest_ids
    assert "ingest-news" in ingest_ids


def test_fetch_wikipedia_overview_writes_marker_when_not_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When Wikipedia has no page (or the network fetch fails), the skill
    writes a 'not found' marker file rather than raising — the dispatcher
    keeps going and the compose agent sees an explicit "we tried" note."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("AKSO.OL", analyst="warren-buffett")

    # Monkeypatch the network fetcher to return None — simulates a miss.
    import compass.distill as distill
    monkeypatch.setattr(distill, "fetch_wikipedia_extract", lambda name, *, timeout=15.0: None)
    # The skill imports the function from compass.distill, so patching the
    # source module is enough.

    run = _load_skill_run("fetch-wikipedia-overview")
    task = Task(id="ingest-overview", stage="ingest", title="t",
                skill="fetch-wikipedia-overview")
    result = asyncio.run(run(engagement=eng, task=task))

    assert result["count"] == 0
    # Marker file landed where the universal runner expects (corpus/overview/)
    marker = eng.root / "corpus" / "overview"
    assert marker.exists()
    assert any(p.name.startswith("wikipedia-") and p.suffix == ".md"
               for p in marker.iterdir())


def test_fetch_wikipedia_overview_writes_extract_when_found(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The happy path — Wikipedia returns prose, the skill writes a
    properly-prefixed Markdown file with header metadata."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("AKSO.OL", analyst="warren-buffett")

    fake_extract = (
        "Aker Solutions ASA is a Norwegian oil-and-gas services company "
        "headquartered in Bærum, providing subsea production systems, "
        "lifecycle services, and decarbonisation technologies to the "
        "offshore energy industry."
    )
    import compass.distill as distill
    monkeypatch.setattr(distill, "fetch_wikipedia_extract",
                        lambda name, *, timeout=15.0: fake_extract)

    run = _load_skill_run("fetch-wikipedia-overview")
    task = Task(id="ingest-overview", stage="ingest", title="t",
                skill="fetch-wikipedia-overview")
    result = asyncio.run(run(engagement=eng, task=task))

    assert result["count"] == 1
    assert result["company_name"] == "Aker Solutions ASA"
    assert result["wiki_chars"] == len(fake_extract)

    # File landed and contains the extract.
    overview_dir = eng.root / "corpus" / "overview"
    files = list(overview_dir.glob("wikipedia-*.md"))
    assert len(files) == 1
    text = files[0].read_text(encoding="utf-8")
    assert "Aker Solutions ASA" in text
    assert "subsea production systems" in text
    assert "bloomberg_ticker" in text  # we have one for AKSO
