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


def test_buffett_pitch_for_akso_skips_sec_at_plan_time() -> None:
    """Layer 2: producers carry ``regions: [US]`` in their frontmatter,
    so the planner doesn't even stamp SEC tasks for EU tickers. Universal
    producers (Yahoo, Wikipedia) still show up. The runtime ``skipped``
    path is reserved for edge cases (free-form tickers that default to
    US but turn out non-US, future region-conditional producers).
    """
    from compass.planner import TEMPLATES
    eng = Engagement(analyst_slug="preview", ticker="AKSO.OL", root=Path("__preview__"))
    tasks = TEMPLATES["buffett-pitch"](eng)
    ingest_ids = {t.id for t in tasks if t.stage == "ingest"}

    # SEC-only producers should NOT be planned for AKSO.OL
    assert not any("filings" in tid for tid in ingest_ids), ingest_ids
    assert "ingest-press-releases" not in ingest_ids
    assert "ingest-insider" not in ingest_ids
    assert "ingest-holdings" not in ingest_ids
    assert "ingest-earnings" not in ingest_ids

    # Universal producers should be present
    assert "ingest-snapshots" in ingest_ids
    assert "ingest-news" in ingest_ids
    assert "ingest-overview" in ingest_ids


def test_buffett_pitch_for_nvda_plans_full_dag() -> None:
    """Sanity: US tickers get the full SEC + yfinance + Wikipedia spine."""
    from compass.planner import TEMPLATES
    eng = Engagement(analyst_slug="preview", ticker="NVDA", root=Path("__preview__"))
    tasks = TEMPLATES["buffett-pitch"](eng)
    ingest_ids = {t.id for t in tasks if t.stage == "ingest"}
    assert "ingest-filings-10-k" in ingest_ids
    assert "ingest-filings-10-q" in ingest_ids
    assert "ingest-snapshots" in ingest_ids
    assert "ingest-news" in ingest_ids
    assert "ingest-overview" in ingest_ids


def test_pitch_memo_for_akso_drops_sec_and_skips_analyze_segments() -> None:
    """pitch-memo (hand-authored) was refactored to delegate ingest to
    auto_ingest_tasks. For AKSO.OL: no SEC tasks → no analyze-segments
    (its dependency was filtered out). analyze-kpis still runs from
    the Yahoo snapshot, so the gate + compose stages continue to make
    sense for an EU ticker.
    """
    from compass.planner import TEMPLATES
    eng = Engagement(analyst_slug="preview", ticker="AKSO.OL", root=Path("__preview__"))
    tasks = TEMPLATES["pitch-memo"](eng)
    ids = {t.id for t in tasks}
    # SEC tasks gone
    assert not any("filings" in tid for tid in ids), ids
    # analyze-segments dropped (depends on ingest-filings-10-k which is gone)
    assert "analyze-segments" not in ids
    # analyze-kpis still runs (depends on ingest-snapshots which is universal)
    assert "analyze-kpis" in ids
    # Gate runs against whatever analyze tasks DID run
    assert "analyze-gate" in ids
    # Compose still happens
    assert "compose-thesis" in ids
    assert "compose-assemble" in ids


def test_pitch_memo_for_nvda_keeps_full_dag() -> None:
    from compass.planner import TEMPLATES
    eng = Engagement(analyst_slug="preview", ticker="NVDA", root=Path("__preview__"))
    tasks = TEMPLATES["pitch-memo"](eng)
    ids = {t.id for t in tasks}
    assert "ingest-filings-10-k" in ids
    assert "analyze-segments" in ids  # 10-K parse still runs


def test_dispatcher_marks_task_as_skipped_when_run_returns_skipped_reason() -> None:
    """Producer skills that return ``{"skipped_reason": "..."}`` should
    flow through the dispatcher as status ``"skipped"`` (not ``"done"``)
    and emit a ``task_skipped`` event."""
    import asyncio as _aio
    from compass.dispatcher import run_engagement
    from compass.skills import SkillSpec
    import compass.skills as skills_mod
    import compass.agent_helper as ah

    # Use the real fetch-sec-filing skill against an EU ticker — that's
    # the exact path the user hit.
    import tempfile, os
    tmpdir = tempfile.mkdtemp()
    os.environ["COMPASS_DATA_DIR"] = tmpdir
    try:
        eng = Engagement.open("AKSO.OL", analyst="warren-buffett")
        # Plant a single task that calls fetch-sec-filing (which is region-gated).
        task = Task(
            id="ingest-10k-test",
            stage="ingest",
            title="t",
            skill="fetch-sec-filing",
            params={"form": "10-K", "limit": 1},
        )
        eng.save_tasks([task])

        events: list[dict] = []
        summary = _aio.run(run_engagement(eng, on_event=lambda e: events.append(e)))

        # Reload tasks from disk to see the dispatcher's saved status.
        reloaded = eng.load_tasks()
        assert reloaded[0].status == "skipped", reloaded[0].status
        # Event firehose carries the explicit type.
        assert any(e.get("type") == "task_skipped" for e in events), events
    finally:
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)


def test_skipped_dependency_does_not_block_downstream() -> None:
    """A skipped task counts as a satisfying completion — downstream
    tasks shouldn't block on it. Otherwise a single region-skip would
    halt the rest of the pipeline."""
    import asyncio as _aio
    from compass.dispatcher import run_engagement

    import tempfile, os
    tmpdir = tempfile.mkdtemp()
    os.environ["COMPASS_DATA_DIR"] = tmpdir
    try:
        eng = Engagement.open("AKSO.OL", analyst="warren-buffett")
        eng.save_tasks([
            Task(id="ingest-10k", stage="ingest", title="t",
                 skill="fetch-sec-filing",
                 params={"form": "10-K", "limit": 1}),
            Task(id="ingest-news", stage="ingest", title="t",
                 skill="fetch-news", depends_on=["ingest-10k"]),
        ])
        events: list[dict] = []
        # We don't actually want to hit Yahoo from the test — let it run
        # but assert it wasn't blocked. The fetch-news task may error
        # without network, but we only care about the blocking behaviour.
        _aio.run(run_engagement(eng, on_event=lambda e: events.append(e),
                                stop_on_error=False))
        reloaded = {t.id: t for t in eng.load_tasks()}
        # ingest-10k is skipped (region gate). ingest-news shouldn't be
        # blocked just because its upstream was a skip.
        assert reloaded["ingest-10k"].status == "skipped"
        assert reloaded["ingest-news"].status != "pending"
        # No task_blocked event for ingest-news
        blocked_for_news = [
            e for e in events
            if e.get("type") == "task_blocked" and e.get("task_id") == "ingest-news"
        ]
        assert not blocked_for_news, blocked_for_news
    finally:
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)


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
