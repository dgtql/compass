"""Slice 7 smoke test: Yahoo Finance snapshot ingestion.

Yahoo Finance is rate-limited and the yfinance library scrapes a moving
target — failures here usually mean upstream changed, not that Compass
broke. Network-skip when offline.
"""

from __future__ import annotations

import os
import socket

import pytest

from compass.ingest.yahoo import YahooSource


def _network_available() -> bool:
    """Cheap reachability probe; avoids running this test on planes / CI without internet."""
    try:
        socket.create_connection(("query2.finance.yahoo.com", 443), timeout=3).close()
        return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _network_available(),
    reason="Yahoo Finance unreachable; skipping live snapshot test.",
)


def test_fetch_writes_snapshot_with_price_and_ledger_rows(tmp_path, monkeypatch) -> None:
    """A live Yahoo fetch for SOC writes a dated snapshot file and ledger rows."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))

    docs = YahooSource().fetch("SOC")

    assert len(docs) == 1
    doc = docs[0]
    assert doc.source == "yahoo"
    assert doc.form_type == "snapshot"
    assert doc.ticker == "SOC"
    assert doc.local_path.exists()
    assert doc.local_path.suffix == ".md"

    body = doc.local_path.read_text(encoding="utf-8")
    # Sanity-check the rendered output. Yahoo's exact fields vary across
    # tickers, so we assert on the structural headings the renderer always
    # emits, not on specific values.
    assert "## Price" in body
    assert "## Recent news" in body or "## Income statement" in body or "## Identity" in body
    assert "Sable" in body or "SOC" in body

    # The chunked rows should be present in the evidence ledger
    from compass.db import list_evidence_for_ticker

    rows = list_evidence_for_ticker("SOC", limit=10)
    assert any(r["form_type"] == "snapshot" for r in rows), (
        "expected at least one snapshot row in the evidence ledger"
    )
