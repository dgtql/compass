"""Slice 4 smoke tests: SQLite evidence ledger + audit log.

The chunking tests use a temp file with deterministic content (no network).
The end-to-end fetch test reuses the EDGAR network path and is skipped when
SEC credentials aren't set.
"""

from __future__ import annotations

import json
import os

import pytest

from compass.db import (
    chunk_markdown_file,
    connect,
    init_db,
    insert_audit,
    list_evidence_for_ticker,
    recent_audit,
)


def _sec_creds_available() -> bool:
    return bool(
        os.environ.get("COMPASS_SEC_USER_NAME")
        and os.environ.get("COMPASS_SEC_USER_EMAIL")
    )


# --- chunking ----------------------------------------------------------------


def test_chunk_markdown_file_emits_byte_offsets(tmp_path) -> None:
    """A 250-line file with default 100-line chunks → 3 chunks, contiguous byte spans."""
    lines = [f"line {i}\n" for i in range(1, 251)]
    fixture = tmp_path / "doc.md"
    fixture.write_text("".join(lines), encoding="utf-8")

    chunks = chunk_markdown_file(fixture)

    assert len(chunks) == 3
    # Line ranges
    assert chunks[0]["line_start"] == 1
    assert chunks[0]["line_end"] == 100
    assert chunks[1]["line_start"] == 101
    assert chunks[1]["line_end"] == 200
    assert chunks[2]["line_start"] == 201
    assert chunks[2]["line_end"] == 250

    # Byte spans are contiguous and match the file size
    assert chunks[0]["char_span_start"] == 0
    for prev, curr in zip(chunks, chunks[1:]):
        assert curr["char_span_start"] == prev["char_span_end"]
    assert chunks[-1]["char_span_end"] == fixture.stat().st_size

    # Each chunk's content round-trips from char span back to bytes on disk
    raw = fixture.read_bytes()
    for c in chunks:
        assert raw[c["char_span_start"] : c["char_span_end"]] == c["content"].encode("utf-8")


# --- audit log ---------------------------------------------------------------


def test_audit_insert_round_trips(tmp_path, monkeypatch) -> None:
    """A row written via insert_audit reads back through recent_audit."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    init_db()

    insert_audit(
        tool_name="Read",
        tool_input_json=json.dumps({"file_path": "/tmp/foo.md", "offset": 100, "limit": 50}),
        file_path="/tmp/foo.md",
        offset_start=100,
        offset_end=150,
    )
    insert_audit(
        tool_name="Read",
        tool_input_json=json.dumps({"file_path": "/tmp/foo.md"}),
        file_path="/tmp/foo.md",
        offset_start=None,
        offset_end=None,
    )

    rows = recent_audit(limit=10)
    assert len(rows) == 2
    # Most-recent first
    assert rows[0]["tool_name"] == "Read"
    assert rows[0]["offset_start"] is None
    assert rows[1]["offset_start"] == 100
    assert rows[1]["offset_end"] == 150


# --- end-to-end fetch → ledger populated -------------------------------------


@pytest.mark.skipif(
    not _sec_creds_available(),
    reason="COMPASS_SEC_USER_NAME / _EMAIL not set; skipping EDGAR network test.",
)
def test_fetch_populates_evidence_ledger(tmp_path, monkeypatch) -> None:
    """`EdgarSource.fetch()` writes evidence rows for the new doc."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    # Re-import inside the test to ensure the DB lives under tmp_path
    from compass.ingest.edgar import EdgarSource

    EdgarSource().fetch("SOC", form_type="10-K", limit=1)

    rows = list_evidence_for_ticker("SOC", limit=500)
    # SOC's 10-K is ~580 KB / ~5000 lines / 100-line chunks → ~50 rows
    assert len(rows) >= 10, f"expected many evidence rows, got {len(rows)}"
    assert rows[0]["form_type"] == "10-K"
    # Every row has the same accession number
    accessions = {r["doc_id"] for r in rows}
    assert len(accessions) == 1, f"expected one doc, got {accessions}"
