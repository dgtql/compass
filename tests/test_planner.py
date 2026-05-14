"""Planner — templates emit valid task lists."""

from __future__ import annotations

import pytest

from compass.engagement import Engagement
from compass.planner import list_templates, plan


@pytest.fixture
def engagement(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return Engagement.open("NVDA")


def test_generic_templates_advertised(engagement) -> None:
    """The four generic (persona-agnostic) templates must always be present."""
    assert {
        "pitch-memo",
        "earnings-reaction",
        "maintenance-refresh",
        "deep-dive",
    }.issubset(set(list_templates()))


def test_buffett_templates_advertised(engagement) -> None:
    """The Buffett pack ships three workflows backed by the ``buffett`` skill."""
    advertised = set(list_templates())
    assert {"buffett-pitch", "buffett-quick-filter", "buffett-sell-check"}.issubset(advertised)


def test_buffett_pitch_collapses_compose_to_one_task(engagement) -> None:
    """Buffett's compose phase is *one* holistic task, not 5 section drafts."""
    tasks = plan(engagement, "buffett-pitch")
    compose = [t for t in tasks if t.stage == "compose"]
    assert len(compose) == 1
    assert compose[0].skill == "buffett"
    assert compose[0].params.get("path") == "B"
    assert compose[0].artifact_path is not None
    assert compose[0].artifact_path.startswith("memos/buffett-pitch/")


def test_buffett_quick_filter_is_light(engagement) -> None:
    """Path A skips heavy ingest (no 10-K parse, no KPI extraction)."""
    tasks = plan(engagement, "buffett-quick-filter")
    skills_used = {t.skill for t in tasks}
    assert "parse-10k-segments" not in skills_used
    assert "extract-kpis" not in skills_used
    assert "buffett" in skills_used
    compose = [t for t in tasks if t.stage == "compose"]
    assert len(compose) == 1
    assert compose[0].params.get("path") == "A"


def test_buffett_sell_check_uses_sell_check_path(engagement) -> None:
    tasks = plan(engagement, "buffett-sell-check")
    compose = [t for t in tasks if t.stage == "compose"]
    assert len(compose) == 1
    assert compose[0].params.get("path") == "sell-check"
    # Sell-check is a final deliverable, so it lives under memos/ alongside
    # pitch + quick-filter — same surfaces, same UI rail, same backups.
    assert compose[0].artifact_path.startswith("memos/buffett-sell-check/")


def test_buffett_quick_filter_writes_to_memos(engagement) -> None:
    """All three Buffett workflows are deliverables — they land in ``memos/``."""
    tasks = plan(engagement, "buffett-quick-filter")
    compose = [t for t in tasks if t.stage == "compose"]
    assert len(compose) == 1
    assert compose[0].artifact_path.startswith("memos/buffett-quick-filter/")


def test_deep_dive_pulls_all_data_sources(engagement) -> None:
    tasks = plan(engagement, "deep-dive")
    skills_used = {t.skill for t in tasks}
    # The deep-dive template should exercise every new data-source skill.
    assert {
        "fetch-insider-trades",
        "fetch-institutional-holdings",
        "fetch-earnings-history",
        "fetch-press-releases",
        "web-research",
    }.issubset(skills_used)


def test_pitch_memo_template_has_all_phases(engagement) -> None:
    tasks = plan(engagement, "pitch-memo")
    phases = {t.stage for t in tasks}
    assert phases == {"setup", "ingest", "analyze", "compose", "maintain"}
    # Every task names a real skill.
    for t in tasks:
        assert t.skill, f"task {t.id} has empty skill"
    # Multiple tasks per phase per the user's requirement.
    by_phase: dict[str, list] = {}
    for t in tasks:
        by_phase.setdefault(t.stage, []).append(t)
    assert len(by_phase["ingest"]) >= 3, "ingest should have >= 3 tasks (10-K, snapshot, news)"
    assert len(by_phase["analyze"]) >= 3
    assert len(by_phase["compose"]) >= 2


def test_dependencies_reference_known_ids(engagement) -> None:
    for name in list_templates():
        tasks = plan(engagement, name)
        ids = {t.id for t in tasks}
        for t in tasks:
            for dep in t.depends_on:
                assert dep in ids, f"{name}: task {t.id} depends on unknown {dep}"


def test_no_dependency_cycle(engagement) -> None:
    for name in list_templates():
        tasks = plan(engagement, name)
        by_id = {t.id: t for t in tasks}
        # DFS for cycles
        WHITE, GREY, BLACK = 0, 1, 2
        color = {t.id: WHITE for t in tasks}

        def visit(tid: str) -> None:
            color[tid] = GREY
            for dep in by_id[tid].depends_on:
                if color[dep] == GREY:
                    raise AssertionError(f"{name}: cycle detected at {dep} → {tid}")
                if color[dep] == WHITE:
                    visit(dep)
            color[tid] = BLACK

        for tid in by_id:
            if color[tid] == WHITE:
                visit(tid)


def test_unknown_template_raises(engagement) -> None:
    with pytest.raises(KeyError):
        plan(engagement, "this-template-does-not-exist")
