"""Skill loader — discovery, frontmatter parsing, run.py loading."""

from __future__ import annotations

import pytest

from compass.skills import import_run_function, list_skills, load_skill


EXPECTED_SKILLS = {
    # Setup
    "plan-research",
    "build-coverage-brief",
    # Ingest (core)
    "fetch-sec-filing",
    "fetch-market-snapshot",
    "fetch-news",
    "parse-10k-segments",
    # Ingest (extended data sources)
    "fetch-insider-trades",
    "fetch-institutional-holdings",
    "fetch-earnings-history",
    "fetch-press-releases",
    "web-research",
    # Analyze
    "extract-kpis",
    "gate-coverage-check",
    # Compose
    "draft-memo-section",
    "assemble-memo",
    # Maintain
    "update-coverage-brief",
}


def test_all_skills_discovered() -> None:
    found = {s.slug for s in list_skills()}
    assert EXPECTED_SKILLS.issubset(found), (
        f"missing: {EXPECTED_SKILLS - found}"
    )


def test_every_skill_has_required_frontmatter() -> None:
    for spec in list_skills():
        assert spec.name, f"{spec.slug}: missing name"
        assert spec.phase in {"setup", "ingest", "analyze", "compose", "maintain"}, (
            f"{spec.slug}: unknown phase {spec.phase!r}"
        )
        assert spec.runner in {"deterministic", "agent"}, (
            f"{spec.slug}: unknown runner {spec.runner!r}"
        )
        if spec.runner == "agent":
            assert spec.allowed_tools, f"{spec.slug}: agent runner needs allowed-tools"


def test_every_skill_run_py_importable() -> None:
    for spec in list_skills():
        fn = import_run_function(spec)
        assert callable(fn), f"{spec.slug}: run() not callable"


def test_load_unknown_skill_raises() -> None:
    with pytest.raises(FileNotFoundError):
        load_skill("this-skill-does-not-exist")
