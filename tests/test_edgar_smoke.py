"""Slice 2 smoke test: fetch SOC's latest 10-K and assert it landed on disk.

Makes a real network call to SEC EDGAR. Auto-skips when SEC identification
env vars aren't set so CI without secrets doesn't fail noisily.
"""

from __future__ import annotations

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


def test_fetch_soc_10k_lands_in_workspace(tmp_path, monkeypatch) -> None:
    """Slice 2 smoke: SOC's latest 10-K is fetched and present on disk."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))

    docs = EdgarSource().fetch("SOC", form_type="10-K", limit=1)

    assert len(docs) == 1, f"expected 1 doc, got {len(docs)}"
    doc = docs[0]
    assert doc.source == "edgar"
    assert doc.ticker == "SOC"
    assert doc.form_type == "10-K"
    assert doc.local_path.exists(), f"accession dir missing: {doc.local_path}"
    # full-submission.txt is the one filename the downloader always writes.
    # primary-document filenames vary by filing type and extension.
    assert (doc.local_path / "full-submission.txt").exists(), (
        f"full-submission.txt missing in {doc.local_path}"
    )
