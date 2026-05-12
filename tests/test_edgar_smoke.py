"""Slice 2 smoke test: fetch SOC's latest 10-K via edgartools.

Makes a real network call to SEC EDGAR. Auto-skips when SEC identification
env vars aren't set so CI without secrets doesn't fail noisily.

Slice 2.5: ``EdgarSource.fetch`` now returns a ``Document.local_path``
pointing at a clean Markdown file (``primary.md``) rather than an accession
directory full of HTML/SGML — the agent and downstream skills consume the
markdown directly.
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


def test_fetch_soc_10k_writes_clean_markdown(tmp_path, monkeypatch) -> None:
    """Slice 2.5 smoke: SOC's latest 10-K lands as readable Markdown + metadata."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))

    docs = EdgarSource().fetch("SOC", form_type="10-K", limit=1)

    assert len(docs) == 1, f"expected 1 doc, got {len(docs)}"
    doc = docs[0]
    assert doc.source == "edgar"
    assert doc.ticker == "SOC"
    assert doc.form_type == "10-K"
    assert doc.local_path.exists(), f"primary.md missing: {doc.local_path}"
    assert doc.local_path.name == "primary.md"

    body = doc.local_path.read_text(encoding="utf-8")
    # A real 10-K's Markdown should be at least ~10 KB and contain identifying
    # SOC content. If either assertion fails, the upstream library changed
    # shape and downstream skills will likely break too — fail loudly.
    assert len(body) > 10_000, f"primary.md surprisingly small: {len(body)} bytes"
    assert "Sable" in body, "expected 'Sable' in SOC's 10-K markdown"

    metadata_path = doc.local_path.parent / "metadata.json"
    assert metadata_path.exists(), "metadata.json missing"
    meta = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert meta["form"] == "10-K"
    assert meta["accession"] == doc.source_id
