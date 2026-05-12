"""FastAPI app — the HTTP/JSON surface that the web UI talks to.

Slice 8: read-only endpoints over the workspace + evidence ledger.
A future slice will add WebSocket streaming for live ``compass research``
runs and pipeline-state events.

The SPA lives in ``compass/static/`` and is served by this same app, so
there's no CORS, no separate web server, and no build step in the dev
loop. Production wheel-install packaging will need to bundle the
``static/`` directory; tracked for whichever slice ships PyPI.
"""

from __future__ import annotations

import re
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from compass.db import get_evidence
from compass.workspace import TICKER_TO_WORKSPACE, data_root, workspace_dir

app = FastAPI(title="Compass API", version="0.1.0")

_STATIC_DIR = Path(__file__).parent / "static"
_WORKSPACE_TO_TICKER = {v: k for k, v in TICKER_TO_WORKSPACE.items()}
_EV_TAG_RE = re.compile(r"\[ev#(\d+(?:\s*,\s*ev#\d+)*)\]")


# --- workspace + memo listing -----------------------------------------------


@app.get("/api/tickers")
def list_tickers() -> list[dict]:
    """Tickers that have a materialized workspace under ``data/tickers/``."""
    tickers_dir = data_root() / "tickers"
    if not tickers_dir.exists():
        return []
    out: list[dict] = []
    for d in sorted(tickers_dir.iterdir()):
        if not d.is_dir():
            continue
        ticker = _WORKSPACE_TO_TICKER.get(d.name, d.name)
        memo_count = sum(1 for _ in (d / "memos").rglob("*.md")) if (d / "memos").exists() else 0
        out.append(
            {
                "ticker": ticker,
                "workspace_key": d.name,
                "memo_count": memo_count,
            }
        )
    return out


@app.get("/api/tickers/{ticker}/memos")
def list_memos(ticker: str) -> list[dict]:
    """All memos under a ticker's workspace, most-recent first."""
    workspace = workspace_dir(ticker)
    memos_root = workspace / "memos"
    if not memos_root.exists():
        return []
    items: list[dict] = []
    for memo_type_dir in sorted(memos_root.iterdir()):
        if not memo_type_dir.is_dir():
            continue
        for memo_file in sorted(memo_type_dir.glob("*.md"), reverse=True):
            items.append(
                {
                    "type": memo_type_dir.name,
                    "date": memo_file.stem,
                    "size_bytes": memo_file.stat().st_size,
                }
            )
    return items


@app.get("/api/memos/{ticker}/{memo_type}/{date}")
def get_memo(ticker: str, memo_type: str, date: str) -> dict:
    """One memo: raw markdown + the list of evidence-row ids it cites."""
    workspace = workspace_dir(ticker)
    memo_path = workspace / "memos" / memo_type / f"{date}.md"
    if not memo_path.exists():
        raise HTTPException(status_code=404, detail=f"memo not found: {memo_path}")
    content = memo_path.read_text(encoding="utf-8")
    citations = sorted({int(n) for match in _EV_TAG_RE.findall(content)
                        for n in re.findall(r"\d+", match)})
    return {
        "ticker": ticker.upper(),
        "type": memo_type,
        "date": date,
        "content": content,
        "citations": citations,
    }


@app.get("/api/evidence/{evidence_id}")
def get_evidence_row(evidence_id: int) -> dict:
    """Return one evidence chunk for the side-panel display."""
    row = get_evidence(evidence_id)
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"evidence row not found: {evidence_id}"
        )
    return {
        "id": row["id"],
        "doc_id": row["doc_id"],
        "ticker": row["ticker"],
        "source": row["source"],
        "source_url": row["source_url"],
        "form_type": row["form_type"],
        "line_start": row["line_start"],
        "line_end": row["line_end"],
        "retrieved_at": row["retrieved_at"],
        "content": row["content"],
    }


# --- static SPA -------------------------------------------------------------

if _STATIC_DIR.exists():
    # Mount /static for any future asset additions (favicon, images, etc.).
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    """Serve the single-page app."""
    return FileResponse(_STATIC_DIR / "index.html")
