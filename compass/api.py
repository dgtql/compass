"""FastAPI surface — what the React UI talks to.

Slice 18 swap: the API now serves **engagement** state (briefs, tasks,
artifacts) rather than the old "tickers + memos + evidence" trio. The
UI's `TickerCoverageView` already expects this shape (`coverage_brief`,
`tasks[]`, `artifacts[]`), so this endpoint surface is the bridge from
the slice-16 mock to the live backend.

Endpoints:

* ``GET  /api/engagements`` — list all engagements on disk
* ``GET  /api/engagements/{analyst}/{ticker}`` — full coverage payload
* ``POST /api/engagements`` — plan (and optionally run) a new engagement
* ``GET  /api/engagements/{analyst}/{ticker}/artifact?path=...`` — fetch
   one artifact file (markdown or JSON) for display in the UI
* ``GET  /api/skills`` — discovered skills
* ``GET  /api/templates`` — planner templates
"""

from __future__ import annotations

import asyncio
import json
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from compass.dispatcher import run_engagement
from compass.engagement import Engagement, list_engagements, resolve_analyst
from compass.planner import list_templates, plan as plan_template
from compass.skills import list_skills
from compass.universe import (
    ALLOWED_EXCHANGES,
    GICS_SECTORS,
    REGIONS,
    filter_tickers,
    load_universe,
)

load_dotenv()

app = FastAPI(title="Compass API", version="0.18.0")

_STATIC_DIR = Path(__file__).parent / "static"

# In-memory run registry: run_id -> dict. Lets the UI poll a long-running
# `compass run` invocation without holding the HTTP request open.
_RUNS: dict[str, dict] = {}


# --- request models ---------------------------------------------------------


class CreateEngagementReq(BaseModel):
    ticker: str
    template: str
    analyst: str | None = None
    auto_run: bool = False


# --- engagement listing -----------------------------------------------------


@app.get("/api/engagements")
def get_engagements() -> list[dict]:
    return list_engagements()


@app.get("/api/engagements/{analyst}/{ticker}")
def get_engagement(analyst: str, ticker: str) -> dict:
    engagement = Engagement.open(ticker, analyst=analyst)
    brief = engagement.load_brief()
    tasks = [t.to_dict() for t in engagement.load_tasks()]
    artifacts = _scan_artifacts(engagement)
    return {
        "analyst": engagement.analyst_slug,
        "ticker": engagement.ticker,
        "root": str(engagement.root),
        "brief": brief,
        "tasks": tasks,
        "artifacts": artifacts,
    }


@app.get("/api/engagements/{analyst}/{ticker}/artifact")
def get_artifact(analyst: str, ticker: str, path: str = Query(...)) -> dict:
    engagement = Engagement.open(ticker, analyst=analyst)
    artifact = engagement.artifact_path(path)
    if not str(artifact).startswith(str(engagement.root.resolve())):
        raise HTTPException(status_code=400, detail="path escapes engagement root")
    if not artifact.exists():
        raise HTTPException(status_code=404, detail=f"artifact not found: {path}")
    text = artifact.read_text(encoding="utf-8", errors="replace")
    return {
        "path": path,
        "size": artifact.stat().st_size,
        "modified_at": artifact.stat().st_mtime,
        "content": text,
    }


@app.post("/api/engagements", status_code=202)
async def create_engagement(req: CreateEngagementReq) -> dict:
    if req.template not in list_templates():
        raise HTTPException(status_code=400, detail=f"unknown template: {req.template}")
    engagement = Engagement.open(req.ticker, analyst=req.analyst)
    tasks = plan_template(engagement, req.template)
    engagement.save_tasks(tasks, template=req.template)

    run_id = str(uuid.uuid4())
    run = {
        "id": run_id,
        "analyst": engagement.analyst_slug,
        "ticker": engagement.ticker,
        "template": req.template,
        "status": "queued",
        "created_at": time.time(),
        "events": [],
        "result": None,
        "error": None,
    }
    _RUNS[run_id] = run

    if req.auto_run:
        asyncio.create_task(_drive_run(run, engagement))
    return {"run_id": run_id, "run": run, "task_count": len(tasks)}


@app.get("/api/runs/{run_id}")
def get_run(run_id: str) -> dict:
    run = _RUNS.get(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail=f"run not found: {run_id}")
    return run


async def _drive_run(run: dict, engagement: Engagement) -> None:
    run["status"] = "running"
    try:
        def record(event: dict) -> None:
            run["events"].append({**event, "ts": time.time()})

        summary = await run_engagement(engagement, on_event=record)
        run["result"] = summary
        run["status"] = "done" if summary["errors"] == 0 else "error"
    except Exception as exc:  # noqa: BLE001
        run["status"] = "error"
        run["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        run["finished_at"] = time.time()


# --- universe (US ticker pool) ---------------------------------------------


@app.get("/api/universe")
def get_universe(
    sector: str | None = Query(None, description="Filter by sector."),
    exchange: str | None = Query(None, description="Filter by exchange (NYSE/NASDAQ/AMEX)."),
    query: str | None = Query(None, description="Substring match on ticker or name."),
    limit: int = Query(500, ge=1, le=10_000, description="Max rows to return."),
) -> dict:
    """Return the US ticker universe (filtered).

    Returns ``{as_of, region, source, total, tickers: [...]}``. Run
    ``compass refresh-universe`` once to seed the file; subsequent calls
    are cached in-memory by the API process.
    """
    loaded = load_universe()
    if loaded is None:
        raise HTTPException(
            status_code=503,
            detail="universe seed missing — run `compass refresh-universe` first.",
        )
    rows = filter_tickers(
        loaded, sector=sector, exchange=exchange, query=query, limit=limit
    )
    return {
        "as_of": loaded.as_of,
        "region": loaded.region,
        "source": loaded.source,
        "total": len(loaded.tickers),
        "count": len(rows),
        "tickers": [t.to_dict() for t in rows],
    }


@app.get("/api/universe/regions")
def get_regions() -> list[str]:
    return list(REGIONS)


@app.get("/api/universe/sectors")
def get_sectors() -> list[str]:
    return list(GICS_SECTORS)


@app.get("/api/universe/exchanges")
def get_exchanges() -> list[str]:
    return list(ALLOWED_EXCHANGES)


# --- skill / template listings ---------------------------------------------


@app.get("/api/skills")
def get_skills() -> list[dict]:
    return [
        {
            "slug": s.slug,
            "name": s.name,
            "phase": s.phase,
            "runner": s.runner,
            "description": s.description,
            "allowed_tools": s.allowed_tools,
        }
        for s in list_skills()
    ]


@app.get("/api/templates")
def get_templates() -> list[str]:
    return list_templates()


# --- helpers ----------------------------------------------------------------


_PHASE_FROM_PATH: list[tuple[str, str]] = [
    (".pipeline/", "setup"),
    ("corpus/", "ingest"),
    ("analysis/", "analyze"),
    ("memos/", "compose"),
]


def _classify(path: str) -> str:
    for prefix, phase in _PHASE_FROM_PATH:
        if path.startswith(prefix):
            return phase
    return "maintain"


def _scan_artifacts(engagement: Engagement) -> list[dict]:
    """Walk the engagement tree and return artifact records the UI can render."""
    out: list[dict] = []
    for sub in (".pipeline", "corpus", "analysis", "memos"):
        d = engagement.root / sub
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if not p.is_file():
                continue
            rel = engagement.relative(p)
            out.append(
                {
                    "path": rel,
                    "stage": _classify(rel),
                    "name": p.name,
                    "size": p.stat().st_size,
                    "modified_at": p.stat().st_mtime,
                }
            )
    return out


# --- static SPA -------------------------------------------------------------


if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    """Serve the single-page app (slice 8 vintage; UI bridge is slice 19)."""
    return FileResponse(_STATIC_DIR / "index.html")
