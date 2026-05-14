"""Skill loader — discovery, frontmatter parsing, run.py loading."""

from __future__ import annotations

import pytest

from compass.skills import (
    _coerce_list,
    _parse_frontmatter,
    import_run_function,
    list_skills,
    load_skill,
)


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


def test_deterministic_skills_have_run_py() -> None:
    """``deterministic`` is reserved for skills with explicit Python code.

    Agent skills (SKILL.md only) don't need ``scripts/run.py`` — the
    universal runner drives them from frontmatter. So the load-time
    ``run.py``-importability check only applies to the deterministic set.
    """
    for spec in list_skills():
        if spec.runner != "deterministic":
            continue
        fn = import_run_function(spec)
        assert callable(fn), f"{spec.slug}: run() not callable"


def test_load_unknown_skill_raises() -> None:
    with pytest.raises(FileNotFoundError):
        load_skill("this-skill-does-not-exist")


# ---------------------------------------------------------------------------
# Frontmatter parser — block scalars, lists, runner inference
# ---------------------------------------------------------------------------


def test_parse_block_scalar_literal() -> None:
    """``description: |`` preserves line breaks, trims trailing blanks."""
    meta = _parse_frontmatter(
        "name: example\n"
        "description: |\n"
        "  First line.\n"
        "  Second line.\n"
        "\n"
        "phase: compose\n"
    )
    assert meta["name"] == "example"
    assert meta["description"] == "First line.\nSecond line."
    assert meta["phase"] == "compose"


def test_parse_block_scalar_folded() -> None:
    """``description: >`` joins lines with spaces."""
    meta = _parse_frontmatter(
        "description: >\n"
        "  First chunk.\n"
        "  Second chunk.\n"
    )
    assert meta["description"] == "First chunk. Second chunk."


def test_parse_yaml_list() -> None:
    """``needs:`` followed by ``- item`` lines returns a list."""
    meta = _parse_frontmatter(
        "needs:\n"
        "  - brief\n"
        "  - filings\n"
        "  - snapshots\n"
    )
    assert meta["needs"] == ["brief", "filings", "snapshots"]


def test_parse_inline_list_via_coerce() -> None:
    """Comma/space-separated values still flatten to a list via ``_coerce_list``."""
    meta = _parse_frontmatter("allowed-tools: Read Write\n")
    assert _coerce_list(meta["allowed-tools"]) == ["Read", "Write"]


def test_runner_inferred_when_no_run_py() -> None:
    """A SKILL.md without ``scripts/run.py`` is an agent skill by default."""
    buffett = load_skill("buffett")
    assert buffett.runner == "agent"
    # And allowed-tools auto-defaults to Read so the agent can read its own references/.
    assert "Read" in buffett.allowed_tools


def test_buffett_description_parsed_from_block_scalar() -> None:
    """The Buffett skill uses ``description: |`` — the parser must keep that text."""
    buffett = load_skill("buffett")
    assert "Warren Buffett" in buffett.description
    assert "investment" in buffett.description.lower()
