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
    ACTIVE_REGIONS,
    ALLOWED_EXCHANGES,
    CAP_BUCKETS,
    CAP_BUCKET_LABELS,
    GICS_SECTORS,
    NON_EQUITY_BUCKETS,
    REGIONS,
    filter_tickers,
    load_universe,
)
from compass.watchlist import (
    add_ticker as watchlist_add,
    hydrate as watchlist_hydrate,
    load_watchlist,
    remove_ticker as watchlist_remove,
)
from compass.analysts import (
    Analyst,
    create_analyst,
    delete_analyst,
    get_analyst,
    list_analysts,
    update_analyst,
    update_analyst_coverage,
)
from compass.chats import (
    append_message as chats_append_message,
    create_session as chats_create_session,
    create_task as chats_create_task,
    delete_session as chats_delete_session,
    delete_task as chats_delete_task,
    list_for_owner as chats_list_for_owner,
    update_task as chats_update_task,
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
    region: str = Query("US", description="Region — only 'US' has data; 'EU' is a placeholder."),
    sector: str | None = Query(None, description="Filter by sector."),
    exchange: str | None = Query(None, description="Filter by exchange (NYSE/NASDAQ/AMEX)."),
    cap_bucket: str | None = Query(None, description="Filter by market-cap bucket."),
    query: str | None = Query(None, description="Ranked search across ticker + name."),
    offset: int = Query(0, ge=0, description="Pagination offset (rows to skip)."),
    limit: int = Query(500, ge=1, le=2000, description="Page size."),
) -> dict:
    """Return tickers in the universe (filtered + paginated).

    Returns ``{as_of, region, source, total, matched, count, offset,
    tickers: [...]}``. ``total`` is the size of the entire universe;
    ``matched`` is the number of rows that satisfied the filters (before
    pagination); ``count`` is the page size returned.

    Run ``compass refresh-universe`` once to seed the file. Subsequent
    calls reuse the in-memory load.
    """
    # EU is a placeholder for v1. Return the same shape with empty rows so
    # the UI can keep its region selector enabled.
    if region.upper() == "EU":
        return {
            "as_of": "",
            "region": "EU",
            "source": "placeholder",
            "total": 0,
            "matched": 0,
            "count": 0,
            "offset": 0,
            "tickers": [],
        }

    loaded = load_universe()
    if loaded is None:
        raise HTTPException(
            status_code=503,
            detail="universe seed missing — run `compass refresh-universe` first.",
        )
    matched = filter_tickers(
        loaded,
        sector=sector,
        exchange=exchange,
        cap_bucket=cap_bucket,
        query=query,
    )
    page = matched[offset : offset + limit]
    return {
        "as_of": loaded.as_of,
        "region": loaded.region,
        "source": loaded.source,
        "total": len(loaded.tickers),
        "matched": len(matched),
        "count": len(page),
        "offset": offset,
        "tickers": [t.to_dict() for t in page],
    }


@app.get("/api/universe/regions")
def get_regions() -> list[dict]:
    """Regions, with an ``active`` flag — EU is listed but not yet populated."""
    return [
        {"id": r, "label": _REGION_LABELS.get(r, r), "active": r in ACTIVE_REGIONS}
        for r in REGIONS
    ]


_REGION_LABELS: dict[str, str] = {
    "US": "United States",
    "EU": "Europe (coming soon)",
}


@app.get("/api/universe/sectors")
def get_sectors() -> list[str]:
    return list(GICS_SECTORS)


@app.get("/api/universe/exchanges")
def get_exchanges() -> list[str]:
    return list(ALLOWED_EXCHANGES)


@app.get("/api/universe/cap-buckets")
def get_cap_buckets() -> list[dict]:
    """Equity cap buckets — what the UI's Cap filter pill row offers.

    Non-equity tickers (ETFs, preferred shares, warrants, units, other)
    still carry a `cap_bucket` and stay searchable in the table, but
    they're not part of this filter list. Their labels come from
    ``/api/universe/cap-bucket-labels``.
    """
    return [{"id": b, "label": CAP_BUCKET_LABELS[b]} for b in CAP_BUCKETS]


@app.get("/api/universe/cap-bucket-labels")
def get_cap_bucket_labels() -> dict[str, str]:
    """Full bucket-id → label map (equity + non-equity), for rendering the
    Cap column of the ticker table."""
    return dict(CAP_BUCKET_LABELS)


# --- my universe (PM's personal watchlist) ---------------------------------


class AddToWatchlistReq(BaseModel):
    ticker: str
    note: str | None = None


@app.get("/api/my-universe")
def get_my_universe() -> dict:
    """Return the watchlist with each entry hydrated from the universe.

    Each row carries the watchlist metadata (added_at, note) plus the
    universe-derived fields (name, exchange, sector, industry, market_cap)
    so the UI can render a single table without a second fetch.
    """
    wl = load_watchlist()
    rows = watchlist_hydrate(wl)
    return {
        "as_of": wl.as_of,
        "count": len(rows),
        "tickers": rows,
    }


@app.post("/api/my-universe", status_code=201)
def add_to_my_universe(req: AddToWatchlistReq) -> dict:
    """Add a ticker to the watchlist. Idempotent."""
    try:
        wl = watchlist_add(req.ticker, note=req.note)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return {"ticker": req.ticker.upper(), "count": len(wl.tickers)}


@app.delete("/api/my-universe/{ticker}")
def remove_from_my_universe(ticker: str) -> dict:
    """Remove a ticker from the watchlist. Idempotent."""
    wl = watchlist_remove(ticker)
    return {"ticker": ticker.upper(), "count": len(wl.tickers)}


# --- analysts (PM's hired roster) ------------------------------------------


class CreateAnalystReq(BaseModel):
    name: str
    sector: str
    coverage: list[str] = []
    persona: str = ""
    title: str | None = None


class UpdateCoverageReq(BaseModel):
    coverage: list[str]


class UpdateAnalystReq(BaseModel):
    name: str | None = None
    title: str | None = None
    sector: str | None = None
    persona: str | None = None
    coverage: list[str] | None = None


@app.get("/api/analysts")
def get_analysts() -> dict:
    """List every hired analyst."""
    items = list_analysts()
    return {"count": len(items), "analysts": [a.to_dict() for a in items]}


@app.post("/api/analysts", status_code=201)
def post_analyst(req: CreateAnalystReq) -> dict:
    """Hire a new analyst. Coverage tickers are validated against the universe."""
    try:
        analyst = create_analyst(
            name=req.name,
            sector=req.sector,
            coverage=req.coverage,
            persona=req.persona,
            title=req.title,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return analyst.to_dict()


@app.get("/api/analysts/{slug}")
def get_analyst_by_slug(slug: str) -> dict:
    analyst = get_analyst(slug)
    if analyst is None:
        raise HTTPException(status_code=404, detail=f"analyst not found: {slug}")
    return analyst.to_dict()


@app.put("/api/analysts/{slug}")
def put_analyst(slug: str, req: UpdateAnalystReq) -> dict:
    """Partial update — any non-null field replaces the current value."""
    try:
        analyst = update_analyst(
            slug,
            name=req.name,
            title=req.title,
            sector=req.sector,
            persona=req.persona,
            coverage=req.coverage,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    return analyst.to_dict()


@app.post("/api/universe/lookup")
def post_universe_lookup(req: dict) -> dict:
    """Bulk lookup: given a list of ticker symbols, return matching rows.

    Used by the analyst detail view to render coverage cards without
    pulling the entire universe.
    """
    tickers = [t.strip().upper() for t in (req.get("tickers") or []) if (t or "").strip()]
    loaded = load_universe()
    if loaded is None:
        return {"count": 0, "tickers": []}
    wanted = set(tickers)
    matches = [t for t in loaded.tickers if t.ticker in wanted]
    return {"count": len(matches), "tickers": [t.to_dict() for t in matches]}


@app.put("/api/analysts/{slug}/coverage")
def put_analyst_coverage(slug: str, req: UpdateCoverageReq) -> dict:
    try:
        analyst = update_analyst_coverage(slug, req.coverage)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return analyst.to_dict()


@app.delete("/api/analysts/{slug}")
def delete_analyst_by_slug(slug: str) -> dict:
    delete_analyst(slug)
    return {"slug": slug}


# --- chats (per-owner tasks + sessions + messages) -------------------------


class CreateChatTaskReq(BaseModel):
    title: str
    coverage_ticker: str | None = None


class UpdateChatTaskReq(BaseModel):
    title: str | None = None
    status: str | None = None
    coverage_ticker: str | None = None


class CreateChatSessionReq(BaseModel):
    task_id: str
    title: str | None = None


class AppendMessageReq(BaseModel):
    role: str = "pm"
    text: str


@app.get("/api/chats/{owner_key}")
def get_chats_for_owner(owner_key: str) -> dict:
    owner = chats_list_for_owner(owner_key)
    return {
        "owner_key": owner_key,
        "tasks": [t.to_dict() for t in owner.tasks],
        "sessions": [s.to_dict() for s in owner.sessions],
    }


@app.post("/api/chats/{owner_key}/tasks", status_code=201)
def post_chat_task(owner_key: str, req: CreateChatTaskReq) -> dict:
    task = chats_create_task(owner_key, title=req.title, coverage_ticker=req.coverage_ticker)
    return task.to_dict()


@app.patch("/api/chats/{owner_key}/tasks/{task_id}")
def patch_chat_task(owner_key: str, task_id: str, req: UpdateChatTaskReq) -> dict:
    try:
        task = chats_update_task(
            owner_key, task_id,
            title=req.title, status=req.status, coverage_ticker=req.coverage_ticker,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return task.to_dict()


@app.delete("/api/chats/{owner_key}/tasks/{task_id}")
def delete_chat_task(owner_key: str, task_id: str) -> dict:
    owner = chats_delete_task(owner_key, task_id)
    return {
        "owner_key": owner_key,
        "task_id": task_id,
        "task_count": len(owner.tasks),
        "session_count": len(owner.sessions),
    }


@app.post("/api/chats/{owner_key}/sessions", status_code=201)
def post_chat_session(owner_key: str, req: CreateChatSessionReq) -> dict:
    try:
        session = chats_create_session(
            owner_key, req.task_id, title=req.title or "New session",
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return session.to_dict()


@app.delete("/api/chats/{owner_key}/sessions/{session_id}")
def delete_chat_session(owner_key: str, session_id: str) -> dict:
    chats_delete_session(owner_key, session_id)
    return {"owner_key": owner_key, "session_id": session_id}


@app.post("/api/chats/{owner_key}/sessions/{session_id}/messages")
async def post_chat_message(owner_key: str, session_id: str, req: AppendMessageReq) -> dict:
    """Append a PM message; call Claude for the analyst/master reply.

    Async because ``generate_reply`` uses ``claude-agent-sdk`` which is
    async-native.
    """
    from compass.llm import generate_reply  # local import — keeps the SDK
    # import out of the FastAPI startup path.

    try:
        session = chats_append_message(owner_key, session_id, role=req.role, text=req.text)
        if req.role == "pm" and req.text.strip():
            try:
                reply = await generate_reply(owner_key, session)
            except Exception as exc:  # noqa: BLE001
                # Surface the failure as an assistant message so the user
                # sees what went wrong instead of a silent timeout.
                reply = (
                    f"(couldn't reach the LLM — {type(exc).__name__}: {exc}.\n\n"
                    "Two ways to fix:\n"
                    "  1. Add ANTHROPIC_API_KEY to your .env (preferred — direct API path).\n"
                    "  2. Make sure the `claude` CLI is on your PATH and you've run `claude` "
                    "once to log in (fallback OAuth path).)"
                )
            if reply:
                session = chats_append_message(owner_key, session_id, role="master", text=reply)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return session.to_dict()


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
