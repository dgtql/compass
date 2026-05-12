"""FastAPI app — the HTTP/JSON surface that the web UI talks to.

Slice 8 brought four read-only endpoints (tickers, memos, evidence) and the
static SPA. Slice 9 adds:

* ``POST /api/tickers`` — materialize a workspace for a new ticker.
* ``POST /api/tasks``   — start a background task (fetch_filing, snapshot,
  research). Returns the task immediately; the agent / network work runs
  in the FastAPI event loop without blocking the response.
* ``GET  /api/tasks``    — list recent tasks (most recent first).
* ``GET  /api/tasks/{id}`` — task detail, including the live event log
  the SPA polls during execution.

Tasks are in-memory only (a process restart loses history). That's fine
for slice 9 — promoting to SQLite happens when persistence matters
(probably whenever sessions / multi-user arrive).

``load_dotenv()`` runs at import so the API process sees the same SEC
credentials the CLI does when started outside a shell with the env vars
already exported.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from compass.agent import DEFAULT_MODEL, research as agent_research
from compass.db import get_evidence
from compass.ingest.edgar import EdgarSource
from compass.ingest.yahoo import YahooSource
from compass.workspace import TICKER_TO_WORKSPACE, data_root, ensure_workspace, workspace_dir

load_dotenv()

app = FastAPI(title="Compass API", version="0.1.0")

_STATIC_DIR = Path(__file__).parent / "static"
_WORKSPACE_TO_TICKER = {v: k for k, v in TICKER_TO_WORKSPACE.items()}
_EV_TAG_RE = re.compile(r"\[ev#(\d+(?:\s*,\s*ev#\d+)*)\]")

# In-memory task store. Task dicts are mutated in place by the background
# runner so /api/tasks/{id} reflects live state without locking.
_TASKS: dict[str, dict] = {}


# --- request models ---------------------------------------------------------


class AddTickerReq(BaseModel):
    ticker: str


class CreateTaskReq(BaseModel):
    ticker: str
    type: str  # fetch_filing | snapshot | research
    params: dict = {}


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


@app.post("/api/tickers")
def add_ticker(req: AddTickerReq) -> dict:
    """Materialize a workspace for ``req.ticker``. Idempotent."""
    ticker = req.ticker.upper().strip()
    if not ticker:
        raise HTTPException(status_code=400, detail="ticker required")
    workspace = ensure_workspace(ticker)
    return {
        "ticker": ticker,
        "workspace_key": workspace.name,
        "workspace_path": str(workspace),
    }


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


# --- tasks ------------------------------------------------------------------


def _new_task(ticker: str, type: str, params: dict) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "ticker": ticker.upper(),
        "type": type,
        "params": params,
        "status": "queued",
        "created_at": time.time(),
        "started_at": None,
        "finished_at": None,
        "events": [],
        "result": None,
        "error": None,
    }


async def _run_task(task: dict) -> None:
    """Execute a task in the FastAPI event loop. Mutates ``task`` in place."""
    task["status"] = "running"
    task["started_at"] = time.time()
    ticker = task["ticker"]
    params = task["params"]

    def _record(event: dict) -> None:
        task["events"].append(event)

    try:
        if task["type"] == "fetch_filing":
            form = params.get("form", "10-K")
            limit = int(params.get("limit", 1))
            _record({"ts": time.time(), "type": "start",
                     "message": f"Fetching {form} for {ticker} (limit {limit})..."})
            # EdgarSource.fetch is synchronous and does blocking network I/O;
            # run it in the default executor so we don't pin the event loop.
            docs = await asyncio.get_event_loop().run_in_executor(
                None, lambda: EdgarSource().fetch(ticker, form_type=form, limit=limit)
            )
            task["result"] = {
                "docs": [
                    {"doc_id": d.source_id, "path": str(d.local_path)} for d in docs
                ],
                "count": len(docs),
            }
            _record({"ts": time.time(), "type": "done",
                     "message": f"Fetched {len(docs)} {form} filing(s)."})

        elif task["type"] == "snapshot":
            _record({"ts": time.time(), "type": "start",
                     "message": f"Pulling Yahoo snapshot for {ticker}..."})
            docs = await asyncio.get_event_loop().run_in_executor(
                None, lambda: YahooSource().fetch(ticker)
            )
            task["result"] = {
                "docs": [
                    {"doc_id": d.source_id, "path": str(d.local_path)} for d in docs
                ],
                "count": len(docs),
            }
            _record({"ts": time.time(), "type": "done",
                     "message": f"Snapshot saved."})

        elif task["type"] == "research":
            memo_type = params.get("memo_type", "pitch")
            model = params.get("model", DEFAULT_MODEL)
            memo_path = await agent_research(
                ticker,
                memo_type=memo_type,
                model=model,
                on_event=_record,
            )
            task["result"] = {
                "memo_path": str(memo_path),
                "memo_type": memo_type,
            }

        else:
            raise ValueError(f"unknown task type: {task['type']}")

        task["status"] = "done"
    except Exception as exc:  # noqa: BLE001
        task["status"] = "error"
        task["error"] = f"{type(exc).__name__}: {exc}"
        _record({"ts": time.time(), "type": "error", "message": task["error"]})
    finally:
        task["finished_at"] = time.time()


@app.post("/api/tasks", status_code=202)
async def create_task(req: CreateTaskReq) -> dict:
    """Queue + start a background task. Returns the task immediately."""
    if not req.ticker:
        raise HTTPException(status_code=400, detail="ticker required")
    if req.type not in ("fetch_filing", "snapshot", "research"):
        raise HTTPException(status_code=400, detail=f"unknown task type: {req.type}")
    task = _new_task(req.ticker, req.type, req.params)
    _TASKS[task["id"]] = task
    asyncio.create_task(_run_task(task))
    return task


@app.get("/api/tasks")
def list_tasks(limit: int = 30) -> list[dict]:
    """Recent tasks, most-recent-created first."""
    items = sorted(_TASKS.values(), key=lambda t: t["created_at"], reverse=True)
    return items[:limit]


@app.get("/api/tasks/{task_id}")
def get_task(task_id: str) -> dict:
    task = _TASKS.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"task not found: {task_id}")
    return task


# --- static SPA -------------------------------------------------------------

if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    """Serve the single-page app."""
    return FileResponse(_STATIC_DIR / "index.html")
