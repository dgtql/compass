"""Universal agent-skill runner — `needs:` resolution, output path, prompt shape.

These tests don't touch the Claude SDK. They exercise the deterministic
plumbing the runner uses to bridge a SKILL.md-only skill to a Compass
engagement: which artifacts get surfaced, where the agent writes, what
the assembled user prompt looks like.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from compass.agent_helper import (
    _CATEGORY_GLOBS,
    _build_default_user_prompt,
    _resolve_needs,
    _resolve_output,
)
from compass.engagement import Engagement, Task
from compass.skills import SkillSpec


@pytest.fixture
def engagement(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Engagement:
    """A fresh engagement rooted under ``tmp_path`` with a small artifact tree."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    eng = Engagement.open("NVDA", analyst="warren-buffett")
    # Lay down representative artifacts the universal runner should surface.
    (eng.root / ".pipeline" / "docs" / "coverage_brief.json").write_text(
        '{"ticker": "NVDA"}', encoding="utf-8",
    )
    (eng.root / "corpus" / "filings" / "10-K" / "acc-001").mkdir(parents=True)
    (eng.root / "corpus" / "filings" / "10-K" / "acc-001" / "primary.md").write_text(
        "# NVDA 10-K", encoding="utf-8",
    )
    (eng.root / "corpus" / "filings" / "10-Q" / "acc-002").mkdir(parents=True)
    (eng.root / "corpus" / "filings" / "10-Q" / "acc-002" / "primary.md").write_text(
        "# NVDA 10-Q", encoding="utf-8",
    )
    (eng.root / "corpus" / "snapshots" / "yahoo").mkdir(parents=True, exist_ok=True)
    (eng.root / "corpus" / "snapshots" / "yahoo" / "2026-05-13.md").write_text(
        "snapshot", encoding="utf-8",
    )
    (eng.root / "corpus" / "news").mkdir(parents=True, exist_ok=True)
    (eng.root / "corpus" / "news" / "2026-05-13.json").write_text(
        "[]", encoding="utf-8",
    )
    return eng


def _spec(slug: str, needs: list[str], output: str | None = None) -> SkillSpec:
    return SkillSpec(
        slug=slug,
        name=slug,
        description="",
        phase="compose",
        runner="agent",
        allowed_tools=["Read"],
        needs=needs,
        output=output,
        max_turns=30,
        model=None,
        body="",
        path=Path("/nonexistent"),
    )


def test_resolve_needs_brief(engagement: Engagement) -> None:
    spec = _spec("test", needs=["brief"])
    found = _resolve_needs(spec, engagement)
    paths = [engagement.relative(p) for p in found["brief"]]
    assert paths == [".pipeline/docs/coverage_brief.json"]


def test_resolve_needs_filings_finds_all_forms(engagement: Engagement) -> None:
    spec = _spec("test", needs=["filings"])
    found = _resolve_needs(spec, engagement)
    paths = [engagement.relative(p) for p in found["filings"]]
    assert "corpus/filings/10-K/acc-001/primary.md" in paths
    assert "corpus/filings/10-Q/acc-002/primary.md" in paths


def test_resolve_needs_filings_narrowed_by_form(engagement: Engagement) -> None:
    """``filings(10-K)`` returns only 10-K primary docs, not 10-Q."""
    spec = _spec("test", needs=["filings(10-K)"])
    found = _resolve_needs(spec, engagement)
    paths = [engagement.relative(p) for p in found["filings(10-K)"]]
    assert paths == ["corpus/filings/10-K/acc-001/primary.md"]


def test_resolve_needs_unknown_category_is_empty(engagement: Engagement) -> None:
    """Unknown categories don't crash — they just resolve to no files."""
    spec = _spec("test", needs=["does-not-exist"])
    found = _resolve_needs(spec, engagement)
    assert found == {"does-not-exist": []}


def test_resolve_needs_missing_files_are_empty(engagement: Engagement) -> None:
    """Categories without on-disk artifacts return empty lists, not errors."""
    spec = _spec("test", needs=["transcripts", "earnings", "insider"])
    found = _resolve_needs(spec, engagement)
    assert found["transcripts"] == []
    assert found["earnings"] == []
    assert found["insider"] == []


def test_resolve_output_uses_task_artifact_path_first(engagement: Engagement) -> None:
    spec = _spec("test", needs=[], output="memos/default/{date}.md")
    task = Task(id="t", stage="compose", title="t", skill="test",
                artifact_path="memos/explicit/foo.md")
    out = _resolve_output(spec, task, engagement)
    assert out is not None
    assert engagement.relative(out) == "memos/explicit/foo.md"


def test_resolve_output_falls_back_to_spec_output(engagement: Engagement) -> None:
    spec = _spec("test", needs=[], output="memos/buffett/{ticker}-{date}.md")
    task = Task(id="t", stage="compose", title="t", skill="test")
    out = _resolve_output(spec, task, engagement)
    assert out is not None
    rel = engagement.relative(out)
    assert rel.startswith("memos/buffett/NVDA-")
    assert rel.endswith(".md")


def test_resolve_output_substitutes_task_params(engagement: Engagement) -> None:
    """``output:`` patterns may reference task.params (e.g. ``{memo_type}``)."""
    spec = _spec("draft", needs=[],
                 output="analysis/sections/{ticker}__{memo_type}__{section_slug}.md")
    task = Task(id="t", stage="compose", title="t", skill="draft",
                params={"memo_type": "pitch", "section_slug": "thesis"})
    out = _resolve_output(spec, task, engagement)
    assert out is not None
    assert engagement.relative(out) == "analysis/sections/NVDA__pitch__thesis.md"


def test_resolve_output_none_when_no_artifact_no_spec(engagement: Engagement) -> None:
    spec = _spec("test", needs=[], output=None)
    task = Task(id="t", stage="compose", title="t", skill="test")
    assert _resolve_output(spec, task, engagement) is None


def test_build_user_prompt_includes_engagement_and_artifacts(
    engagement: Engagement,
) -> None:
    spec = _spec("buffett", needs=["brief", "filings", "snapshots"],
                 output="memos/buffett-pitch/{date}.md")
    task = Task(id="compose-buffett", stage="compose",
                title="Buffett analysis on NVDA",
                skill="buffett",
                description="Full pitch via Buffett's deep framework.")
    artifacts = _resolve_needs(spec, engagement)
    output_path = _resolve_output(spec, task, engagement)
    prompt = _build_default_user_prompt(spec, engagement, task, artifacts, output_path)

    # Header lines
    assert "buffett skill for NVDA" in prompt
    assert "warren-buffett" in prompt
    # Task context surfaces
    assert "Buffett's deep framework" in prompt
    # Each declared need gets its own section
    assert "## brief" in prompt
    assert "## filings" in prompt
    assert "## snapshots" in prompt
    # Specific artifact paths appear (relative, not absolute)
    assert "corpus/filings/10-K/acc-001/primary.md" in prompt
    assert "corpus/snapshots/yahoo/2026-05-13.md" in prompt
    # Output instruction with absolute path (separator is OS-specific).
    assert "Write your result" in prompt
    assert "buffett-pitch" in prompt
    assert ".md" in prompt


def test_build_user_prompt_surfaces_task_params(engagement: Engagement) -> None:
    """Params (memo_type, section_order, query, ...) must appear in the prompt."""
    spec = _spec("assemble", needs=["sections"],
                 output="memos/{ticker}/{date}.md")
    task = Task(id="t", stage="compose", title="assemble",
                skill="assemble", artifact_path="memos/pitch/2026-05-13.md",
                params={"memo_type": "pitch",
                        "section_order": ["thesis", "business", "risks"]})
    artifacts = _resolve_needs(spec, engagement)
    output_path = _resolve_output(spec, task, engagement)
    prompt = _build_default_user_prompt(spec, engagement, task, artifacts, output_path)
    assert "Task parameters" in prompt
    assert '"memo_type": "pitch"' in prompt
    assert "section_order" in prompt
    assert "thesis" in prompt


def test_build_user_prompt_skips_output_when_none(engagement: Engagement) -> None:
    """Read-only skills (no output) don't get a 'Write your result' section."""
    spec = _spec("read-only", needs=["brief"], output=None)
    task = Task(id="t", stage="analyze", title="t", skill="read-only")
    artifacts = _resolve_needs(spec, engagement)
    prompt = _build_default_user_prompt(spec, engagement, task, artifacts, None)
    assert "Write your result" not in prompt
    assert "Your output" not in prompt


def test_category_globs_cover_engagement_layout() -> None:
    """Every documented category in engagement.py should be in the table."""
    documented = {
        "brief", "tasks",
        "filings", "snapshots", "transcripts", "news",
        "insider", "holdings", "earnings",
        "segments", "kpis", "sections", "gates",
        "memos",
    }
    assert documented.issubset(set(_CATEGORY_GLOBS))
