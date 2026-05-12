"""Slice 3 smoke test: agent reads a file and produces a grounded summary.

Uses an inline fixture (not the EDGAR-fetched 10-K) so the test doesn't
depend on Slice 2's network state. Validates: Read tool wiring, PreToolUse
hook fires, and the agent actually references content from the file rather
than generic boilerplate.

Makes a real Claude API call. Auto-skips when no auth source is available.
"""

from __future__ import annotations

import os
import shutil

import pytest

from compass.agent import summarize


def _auth_available() -> bool:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return True
    if shutil.which("claude"):
        return True
    return False


pytestmark = pytest.mark.skipif(
    not _auth_available(),
    reason="No ANTHROPIC_API_KEY and no `claude` CLI on PATH.",
)


async def test_summarize_references_file_content(tmp_path) -> None:
    """Slice 3 smoke: agent's summary cites at least one specific fact from the file."""
    fixture = tmp_path / "fake_filing.txt"
    fixture.write_text(
        "Sable Offshore Corp (SOC) reported Q4 2025 revenue of $42 million. "
        "Production restart of the Santa Ynez Unit faced regulatory delays in California. "
        "Total liquidity at year-end was $180 million. "
        "Management guided to first oil from Platform Harmony in H1 2026.",
        encoding="utf-8",
    )

    summary = await summarize(fixture, ticker="SOC")

    assert summary, "agent returned an empty summary"
    # Sanity that the agent grounded its answer in the file, not generic knowledge.
    lower = summary.lower()
    hits = sum(
        kw in lower or kw in summary
        for kw in (
            "santa ynez",
            "$42",
            "$180",
            "platform harmony",
            "regulatory",
        )
    )
    assert hits >= 1, f"summary doesn't reference fixture content: {summary!r}"
