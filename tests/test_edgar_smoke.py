"""EDGAR ingestion smoke test (slice 18 refresh).

Makes a real network call to SEC EDGAR. Auto-skips when SEC identification
env vars aren't set so CI without secrets doesn't fail noisily.

Slice 18: ``EdgarSource.fetch`` now takes an explicit ``engagement_root``
and the SQLite ledger is gone — the markdown file on disk is the evidence.
"""

from __future__ import annotations

import json
import os

import pytest

from compass.ingest.edgar import EdgarSource


def _sec_creds_available() -> bool:
    return bool(
        os.environ.get("COMPASS_SEC_USER_NAME")
        and os.environ.get("COMPASS_SEC_USER_EMAIL")
    )


pytestmark = pytest.mark.skipif(
    not _sec_creds_available(),
    reason="COMPASS_SEC_USER_NAME / _EMAIL not set; skipping EDGAR network test.",
)


def test_fetch_soc_10k_writes_clean_markdown(tmp_path) -> None:
    """SOC's latest 10-K lands as readable Markdown + metadata under the engagement root."""
    docs = EdgarSource().fetch("SOC", engagement_root=tmp_path, form_type="10-K", limit=1)

    assert len(docs) == 1, f"expected 1 doc, got {len(docs)}"
    doc = docs[0]
    assert doc.source == "edgar"
    assert doc.ticker == "SOC"
    assert doc.form_type == "10-K"
    assert doc.local_path.exists(), f"primary.md missing: {doc.local_path}"
    assert doc.local_path.name == "primary.md"
    assert tmp_path in doc.local_path.parents

    body = doc.local_path.read_text(encoding="utf-8")
    assert len(body) > 10_000, f"primary.md surprisingly small: {len(body)} bytes"
    assert "Sable" in body, "expected 'Sable' in SOC's 10-K markdown"

    metadata_path = doc.local_path.parent / "metadata.json"
    assert metadata_path.exists(), "metadata.json missing"
    meta = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert meta["form"] == "10-K"
    assert meta["accession"] == doc.source_id
