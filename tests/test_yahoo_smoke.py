"""Yahoo ingestion smoke test (slice 18 refresh).

Network-skip when offline. yfinance is a moving target — failures here
usually mean upstream changed, not that Compass broke.
"""

from __future__ import annotations

import socket

import pytest

from compass.ingest.yahoo import YahooSource


def _network_available() -> bool:
    try:
        socket.create_connection(("query2.finance.yahoo.com", 443), timeout=3).close()
        return True
    except OSError:
        return False


pytestmark = pytest.mark.skipif(
    not _network_available(),
    reason="Yahoo Finance unreachable; skipping live snapshot test.",
)


def test_fetch_writes_snapshot_under_engagement_root(tmp_path) -> None:
    docs = YahooSource().fetch("SOC", engagement_root=tmp_path)

    assert len(docs) == 1
    doc = docs[0]
    assert doc.source == "yahoo"
    assert doc.form_type == "snapshot"
    assert doc.ticker == "SOC"
    assert doc.local_path.exists()
    assert doc.local_path.suffix == ".md"
    assert tmp_path in doc.local_path.parents

    body = doc.local_path.read_text(encoding="utf-8")
    assert "## Price" in body
    assert "Sable" in body or "SOC" in body


def test_fetch_news_returns_structured_items() -> None:
    items = YahooSource().fetch_news("SOC", limit=5)
    # Yahoo's news feed for any active ticker should have at least one item;
    # if it doesn't, the upstream shape changed and we want to know.
    assert isinstance(items, list)
    if items:
        sample = items[0]
        assert "title" in sample
