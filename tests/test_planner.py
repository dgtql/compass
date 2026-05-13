"""Planner — templates emit valid task lists."""

from __future__ import annotations

import pytest

from compass.engagement import Engagement
from compass.planner import list_templates, plan


@pytest.fixture
def engagement(tmp_path, monkeypatch):
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    return Engagement.open("NVDA")


def test_templates_advertise_four(engagement) -> None:
    assert set(list_templates()) == {
        "pitch-memo",
        "earnings-reaction",
        "maintenance-refresh",
        "deep-dive",
    }


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
