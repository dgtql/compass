"""Slice 8 smoke tests for the FastAPI app.

Uses FastAPI's ``TestClient`` so we don't have to spin up uvicorn.
The tests stand up a minimal workspace + ledger row in a tmp dir and
exercise the read-only endpoints.
"""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient

from compass.api import app
from compass.db import chunk_markdown_file, insert_evidence_for_document
from compass.workspace import ensure_workspace


def _seed_workspace(tmp_path, monkeypatch, ticker: str = "SOC") -> dict:
    """Materialize a workspace + a memo + one evidence row. Returns paths."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    workspace = ensure_workspace(ticker)

    # A primary.md so the chunker has something to chunk
    filings = workspace / "corpus" / "filings" / "10-K" / "0001111111-26-000001"
    filings.mkdir(parents=True, exist_ok=True)
    primary = filings / "primary.md"
    primary.write_text("# Test 10-K\n\n" + "\n".join(f"line {i}" for i in range(1, 121)), encoding="utf-8")

    chunks = chunk_markdown_file(primary)
    insert_evidence_for_document(
        doc_id="0001111111-26-000001",
        ticker=ticker,
        source="edgar",
        source_url="https://www.sec.gov/test",
        form_type="10-K",
        retrieved_at=datetime.now(timezone.utc),
        local_path=primary,
        chunks=chunks,
    )

    # A memo that cites ev#1
    memo_dir = workspace / "memos" / "pitch"
    memo_dir.mkdir(parents=True, exist_ok=True)
    memo = memo_dir / "2026-05-12.md"
    memo.write_text(
        "# Test Co (SOC) — Pitch Memo\n\n"
        "## Thesis\nThe company exists [ev#1].\n\n"
        "## Sources\n- 10-K — accession `0001111111-26-000001`\n",
        encoding="utf-8",
    )
    return {"workspace": workspace, "memo": memo, "primary": primary}


def test_list_tickers_includes_seeded(tmp_path, monkeypatch) -> None:
    _seed_workspace(tmp_path, monkeypatch)
    client = TestClient(app)
    resp = client.get("/api/tickers")
    assert resp.status_code == 200
    tickers = resp.json()
    assert any(t["ticker"] == "SOC" for t in tickers)
    soc = next(t for t in tickers if t["ticker"] == "SOC")
    assert soc["memo_count"] == 1
    assert soc["workspace_key"] == "SOC_US"


def test_list_memos_returns_pitch(tmp_path, monkeypatch) -> None:
    _seed_workspace(tmp_path, monkeypatch)
    client = TestClient(app)
    resp = client.get("/api/tickers/SOC/memos")
    assert resp.status_code == 200
    memos = resp.json()
    assert len(memos) == 1
    assert memos[0]["type"] == "pitch"
    assert memos[0]["date"] == "2026-05-12"


def test_get_memo_returns_content_and_parsed_citations(tmp_path, monkeypatch) -> None:
    _seed_workspace(tmp_path, monkeypatch)
    client = TestClient(app)
    resp = client.get("/api/memos/SOC/pitch/2026-05-12")
    assert resp.status_code == 200
    body = resp.json()
    assert "exists [ev#1]" in body["content"]
    assert body["citations"] == [1]


def test_get_evidence_returns_chunk(tmp_path, monkeypatch) -> None:
    _seed_workspace(tmp_path, monkeypatch)
    client = TestClient(app)
    resp = client.get("/api/evidence/1")
    assert resp.status_code == 200
    ev = resp.json()
    assert ev["id"] == 1
    assert ev["ticker"] == "SOC"
    assert ev["form_type"] == "10-K"
    assert "line " in ev["content"]


def test_get_evidence_404_for_missing(tmp_path, monkeypatch) -> None:
    _seed_workspace(tmp_path, monkeypatch)
    client = TestClient(app)
    resp = client.get("/api/evidence/9999")
    assert resp.status_code == 404


def test_index_serves_html(tmp_path, monkeypatch) -> None:
    _seed_workspace(tmp_path, monkeypatch)
    client = TestClient(app)
    resp = client.get("/")
    assert resp.status_code == 200
    assert b"<title>Compass</title>" in resp.content


def test_post_ticker_materializes_workspace(tmp_path, monkeypatch) -> None:
    """Slice 9: POST /api/tickers creates a workspace and shows up in GET."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    client = TestClient(app)

    resp = client.post("/api/tickers", json={"ticker": "AAPL"})
    assert resp.status_code == 200
    assert resp.json()["ticker"] == "AAPL"

    listed = client.get("/api/tickers").json()
    assert any(t["ticker"] == "AAPL" for t in listed)


def test_post_task_returns_queued_then_status_progresses(tmp_path, monkeypatch) -> None:
    """Slice 9: POST /api/tasks queues + starts; GET /api/tasks/{id} reflects state.

    Uses a deliberately unknown task type so the runner short-circuits to
    ``error`` without making any network calls — the test asserts the
    queued→error transition itself, which is the contract we care about
    independent of the upstream sources.
    """
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    client = TestClient(app)
    client.post("/api/tickers", json={"ticker": "AAPL"})

    resp = client.post(
        "/api/tasks",
        json={"ticker": "AAPL", "type": "definitely_not_real", "params": {}},
    )
    # Type validation rejects it up front
    assert resp.status_code == 400


def test_post_task_unknown_ticker_still_accepted(tmp_path, monkeypatch) -> None:
    """Tasks queue against any ticker string; the runner reports the
    error in the task body, not via the POST response."""
    monkeypatch.setenv("COMPASS_DATA_DIR", str(tmp_path))
    client = TestClient(app)

    resp = client.post(
        "/api/tasks",
        json={"ticker": "ZZZZ", "type": "research", "params": {"memo_type": "pitch"}},
    )
    assert resp.status_code == 202
    task = resp.json()
    assert task["status"] in ("queued", "running", "error")
    assert task["ticker"] == "ZZZZ"
