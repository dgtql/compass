"""Slice 6 smoke tests for the research pipeline.

A full ``compass research`` invocation makes a 4-minute live Claude call
and is verified manually via the CLI — outside the scope of an automated
suite. These tests cover the deterministic helpers (citation-map building,
skill discovery) and the guard rails (clear errors when no filings are
ingested or the requested skill doesn't exist).
"""

from __future__ import annotations

import os
import pytest

from compass.agent import _build_citation_map, research
from compass.db import insert_evidence_for_document, chunk_markdown_file
from datetime import datetime, timezone


def _seed_evidence(tmp_path, monkeypatch, ticker: str = "SOC") -> None:
    """Populate compass.db with one fake doc's chunks for testing."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    doc = tmp_path / "fake.md"
    doc.write_text("\n".join(f"line {i}" for i in range(1, 251)), encoding="utf-8")
    chunks = chunk_markdown_file(doc)
    insert_evidence_for_document(
        doc_id="0001234567-26-000001",
        ticker=ticker,
        source="edgar",
        source_url="https://www.sec.gov/test",
        form_type="10-K",
        retrieved_at=datetime.now(timezone.utc),
        local_path=doc,
        chunks=chunks,
    )


def test_citation_map_lists_evidence_rows(tmp_path, monkeypatch) -> None:
    _seed_evidence(tmp_path, monkeypatch)
    table = _build_citation_map("SOC")
    assert "| ev_id |" in table  # header present
    # 250 lines / 100-line chunks → 3 rows, with line ranges
    assert "1-100" in table
    assert "101-200" in table
    assert "201-250" in table
    assert "0001234567-26-000001" in table


def test_citation_map_empty_for_unknown_ticker(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    from compass.db import init_db
    init_db()
    table = _build_citation_map("AAPL")
    assert "no evidence rows" in table.lower()


@pytest.mark.asyncio
async def test_research_errors_when_no_filings(tmp_path, monkeypatch) -> None:
    """Clear, actionable error when the ticker has no fetched filings."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    with pytest.raises(FileNotFoundError, match="no filings ingested"):
        await research("ZZZZ", memo_type="pitch")


@pytest.mark.asyncio
async def test_research_errors_when_skill_missing(tmp_path, monkeypatch) -> None:
    """Clear, actionable error when an unknown memo type is requested."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    # The error fires before we look for filings — skill lookup is first.
    with pytest.raises(FileNotFoundError, match="skill not found"):
        await research("ZZZZ", memo_type="bogus")
