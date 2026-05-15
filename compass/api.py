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
import re
import time
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from compass.dispatcher import run_engagement
from compass.engagement import (
    Engagement,
    compute_analyst_live_status,
    engagements_root,
    list_engagements,
    resolve_analyst,
)
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
    hire_data_engineer,
    list_analysts,
    update_analyst,
    update_analyst_coverage,
)
from compass.packs import get_pack, list_packs
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

app = FastAPI(title="Compass API", version="0.19.0")

_STATIC_DIR = Path(__file__).parent / "static"
_SPECS_DIR = Path(__file__).resolve().parent.parent / "specs" / "data"

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


@app.get("/api/engagements/{analyst}/{ticker}/tasks")
def get_engagement_tasks(analyst: str, ticker: str) -> dict:
    """Tasks for one engagement (split out from the bundled engagement payload).

    The EngagementContext on the frontend fetches just this slice and
    re-fetches whenever it receives a ``tasks-updated`` event on the
    events stream, mirroring the pattern from doc 16 §4.
    """
    engagement = Engagement.open(ticker, analyst=analyst)
    tasks = engagement.load_tasks()
    return {
        "analyst": engagement.analyst_slug,
        "ticker": engagement.ticker,
        "task_count": len(tasks),
        "tasks": [t.to_dict() for t in tasks],
    }


class SetTaskStatusReq(BaseModel):
    status: str  # pending | in-progress | done | review | error | cancelled


_ALLOWED_STATUSES = {"pending", "in-progress", "done", "review", "error", "cancelled"}


@app.post("/api/engagements/{analyst}/{ticker}/tasks/{task_id}/status")
def set_engagement_task_status(
    analyst: str, ticker: str, task_id: str, req: SetTaskStatusReq,
) -> dict:
    """Manually mutate a task's status. Writes through ``save_tasks`` so it
    broadcasts a ``tasks-updated`` event to every subscriber."""
    new_status = (req.status or "").strip().lower()
    if new_status not in _ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"status must be one of {sorted(_ALLOWED_STATUSES)}, got {req.status!r}",
        )
    engagement = Engagement.open(ticker, analyst=analyst)
    tasks = engagement.load_tasks()
    target = next((t for t in tasks if t.id == task_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail=f"task not found: {task_id}")
    target.status = new_status
    engagement.save_tasks(tasks)  # publishes tasks-updated
    return target.to_dict()


@app.get("/api/engagements/{analyst}/{ticker}/events/stream")
async def stream_engagement_events(analyst: str, ticker: str):
    """SSE fan-out of every event published for this engagement.

    Event shapes (the ``type`` field is the SSE event name):

      event: tasks-updated   data: {ticker, analyst, task_count}
      event: task-event      data: {ts, type, task_id?, skill?, ...}
      event: ping            data: {ts}        ← heartbeat every 25s

    Heartbeats keep proxies / browser idle-timeouts from closing the
    connection. The client should treat them as no-ops.
    """
    from compass.events import subscribe

    # Resolve to the same path Engagement.open uses so the subscriber
    # key matches what publishers will broadcast under.
    engagement = Engagement.open(ticker, analyst=analyst)
    resolved_analyst = engagement.analyst_slug
    resolved_ticker = engagement.ticker

    async def event_gen():
        # First frame: a "hello" so the client can sync.
        yield _sse("hello", {
            "ticker": resolved_ticker,
            "analyst": resolved_analyst,
        })

        import asyncio
        sub_iter = subscribe(resolved_analyst, resolved_ticker)
        sub_anext = sub_iter.__aiter__().__anext__
        try:
            while True:
                # Race the subscriber against a 25s heartbeat so idle
                # streams stay alive.
                event_task = asyncio.create_task(sub_anext())
                heartbeat = asyncio.create_task(asyncio.sleep(25))
                done, pending = await asyncio.wait(
                    {event_task, heartbeat},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if event_task in done:
                    heartbeat.cancel()
                    try:
                        event = event_task.result()
                    except StopAsyncIteration:
                        return
                    ev_name = event.get("type", "event")
                    yield _sse(ev_name, event)
                else:
                    event_task.cancel()
                    yield _sse("ping", {"ts": _now_iso_simple()})
        finally:
            try:
                await sub_iter.aclose()
            except Exception:  # noqa: BLE001
                pass

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


def _now_iso_simple() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


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
    sector: str | None = None
    coverage: list[str] = []
    persona: str = ""
    title: str | None = None


class HireFromPackReq(BaseModel):
    """Body for ``POST /api/analysts/from-pack``.

    ``pack_id`` is required; everything else lets the user override the
    pack's defaults at hire time (rename, change sector, edit voice).
    Coverage defaults to empty — the user adds tickers later from the
    coverage tab or by editing.
    """
    pack_id: str
    name: str | None = None
    title: str | None = None
    sector: str | None = None
    persona: str | None = None
    coverage: list[str] = []


class UpdateCoverageReq(BaseModel):
    coverage: list[str]


class UpdateAnalystReq(BaseModel):
    name: str | None = None
    title: str | None = None
    sector: str | None = None
    persona: str | None = None
    coverage: list[str] | None = None


def _enrich_with_live_status(analyst_dict: dict) -> dict:
    """Override ``status`` + ``current_focus`` with values derived from the
    analyst's engagement task lists. The stored ``Analyst.status`` field
    is a static default; the live status is what the UI cares about. We
    leave the persisted record alone — only the response is enriched.
    """
    slug = analyst_dict.get("slug") or ""
    if not slug:
        return analyst_dict
    live = compute_analyst_live_status(slug)
    analyst_dict["status"] = live["status"]
    # Only override current_focus when the live view actually has one,
    # so a manually-set static focus survives an idle analyst.
    if live["current_focus"]:
        analyst_dict["current_focus"] = live["current_focus"]
    analyst_dict["active_task_count"] = live["active_task_count"]
    return analyst_dict


@app.get("/api/analysts")
def get_analysts() -> dict:
    """List every hired analyst. ``status`` and ``current_focus`` are
    enriched with live values derived from each analyst's engagement
    tasks — so a sidebar / dashboard rendering this payload reflects
    what the pod is actually doing right now."""
    items = list_analysts()
    return {
        "count": len(items),
        "analysts": [_enrich_with_live_status(a.to_dict()) for a in items],
    }


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


@app.post("/api/analysts/data-engineer")
def post_hire_data_engineer(response: Response) -> dict:
    """Hire the singleton Data Engineer role.

    Idempotent — returns 201 on first hire, 200 if the DE was already on
    the roster. The response body is the analyst record either way so
    the UI can route to the analyst-detail view without an extra fetch.
    """
    analyst, created = hire_data_engineer()
    response.status_code = 201 if created else 200
    return analyst.to_dict()


@app.post("/api/analysts/from-pack", status_code=201)
def post_analyst_from_pack(req: HireFromPackReq) -> dict:
    """Hire an analyst pre-filled from a persona pack.

    The pack contributes title, sector hint (overridable), voice (→ persona),
    skill toolkit (``analyst.skills``), default workflow
    (``analyst.default_template``), and a pack id (so the chat surface
    can later look up the pack's workflow chips).
    """
    pack = get_pack(req.pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail=f"pack not found: {req.pack_id!r}")
    try:
        analyst = create_analyst(
            name=(req.name or pack.name),
            # Use the PM's pick verbatim — no silent fallback to
            # ``pack.sector_hint``. If the PM left it blank in the UI,
            # the analyst is hired as a generalist (no sector).
            sector=req.sector,
            coverage=req.coverage,
            persona=(req.persona if req.persona is not None else pack.voice),
            title=(req.title or pack.title),
            skills=pack.skills,
            default_template=pack.default_template,
            pack=pack.id,
            avatar_color=pack.avatar_color,
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
    return _enrich_with_live_status(analyst.to_dict())


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


@app.get("/api/analysts/{slug}/deliverables")
def get_analyst_deliverables(slug: str) -> dict:
    """Finished-product deliverables across this analyst's engagements.

    A "deliverable" is something the PM consumes — currently only files
    under ``memos/`` (pitch / earnings-reaction / maintenance / deep-dive).
    Intermediate artifacts (briefs, KPIs, filings, sections, snapshots)
    are exposed separately via the per-engagement
    ``/api/engagements/{a}/{t}/files`` endpoint.
    """
    from compass.engagement import engagements_root

    root = engagements_root() / slug
    if not root.exists():
        return {"slug": slug, "count": 0, "deliverables": []}

    items: list[dict] = []
    for ticker_dir in sorted(root.iterdir()):
        if not ticker_dir.is_dir():
            continue
        ticker = ticker_dir.name
        memos_dir = ticker_dir / "memos"
        if not memos_dir.exists():
            continue
        for p in memos_dir.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(ticker_dir).as_posix()
            items.append({
                "ticker": ticker,
                "path": rel,
                "name": p.name,
                "category": _classify_deliverable(rel),
                "size": p.stat().st_size,
                "modified_at": p.stat().st_mtime,
            })
    items.sort(key=lambda o: o["modified_at"], reverse=True)
    return {"slug": slug, "count": len(items), "deliverables": items}


@app.get("/api/engagements/{analyst}/{ticker}/files")
def get_engagement_files(analyst: str, ticker: str) -> dict:
    """Every research file for one engagement, with memos surfaced first.

    Returns rows grouped logically by directory; the chat right rail
    renders them under headers (Pitch memo / Coverage brief / Filings /
    Snapshots / Sections / KPIs / Gates / News / Transcripts). Memo
    outputs are included in this listing and flagged ``is_output: true``
    so the rail can stack them at the top of the file tree.
    """
    engagement = Engagement.open(ticker, analyst=analyst)
    root = engagement.root
    items: list[dict] = []

    scan_dirs: list[Path] = [
        root / "memos",
        root / "analysis",
        root / "corpus",
        root / ".pipeline" / "docs",
    ]
    for base in scan_dirs:
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file():
                continue
            rel = p.relative_to(root).as_posix()
            items.append({
                "path": rel,
                "name": p.name,
                "category": _classify_deliverable(rel),
                "size": p.stat().st_size,
                "modified_at": p.stat().st_mtime,
                # Memo outputs are the "headline" deliverable for the
                # engagement — flagged so the UI can pin them at the top
                # of the rail above intermediate research files.
                "is_output": rel.startswith("memos/"),
            })
    items.sort(key=lambda o: o["modified_at"], reverse=True)
    return {
        "analyst": engagement.analyst_slug,
        "ticker": engagement.ticker,
        "count": len(items),
        "files": items,
    }


_DELIVERABLE_CATEGORIES: list[tuple[str, str]] = [
    ("memos/pitch/",                  "Pitch memo"),
    ("memos/earnings-reaction/",      "Earnings reaction"),
    ("memos/maintenance/",            "Maintenance update"),
    ("memos/deep-dive/",              "Deep dive"),
    ("memos/buffett-pitch/",          "Buffett pitch"),
    ("memos/buffett-quick-filter/",   "Buffett quick filter"),
    ("memos/buffett-sell-check/",     "Buffett sell check"),
    ("memos/",                        "Memo"),
    ("analysis/sections/",        "Section draft"),
    ("analysis/kpis/",            "KPIs"),
    ("analysis/gates/",           "Quality gate"),
    ("analysis/segments/",        "10-K segment"),
    ("corpus/filings/",           "SEC filing"),
    ("corpus/snapshots/",         "Market snapshot"),
    ("corpus/news/",              "News"),
    ("corpus/transcripts/",       "Transcript"),
    (".pipeline/docs/coverage_brief", "Coverage brief"),
]


def _classify_deliverable(rel_path: str) -> str:
    for prefix, label in _DELIVERABLE_CATEGORIES:
        if rel_path.startswith(prefix):
            return label
    return "Other"


@app.get("/api/analysts/{slug}/tasks")
def get_analyst_tasks_all(slug: str) -> dict:
    """Every task across every engagement filed under this analyst.

    Each row carries its ``ticker`` so the UI can group/filter. Sorted
    by ``finished_at`` (then ``started_at``, then position in tasks.json)
    so the most recent activity floats to the top.
    """
    from compass.engagement import engagements_root

    root = engagements_root() / slug
    if not root.exists():
        return {"slug": slug, "count": 0, "tasks": []}

    rows: list[dict] = []
    for ticker_dir in sorted(root.iterdir()):
        if not ticker_dir.is_dir():
            continue
        ticker = ticker_dir.name
        try:
            engagement = Engagement.open(ticker, analyst=slug)
        except Exception:  # noqa: BLE001 — skip broken engagements
            continue
        for idx, t in enumerate(engagement.load_tasks()):
            d = t.to_dict()
            d["ticker"] = ticker
            d["_order"] = idx
            rows.append(d)
    rows.sort(
        key=lambda r: (
            r.get("finished_at") or "",
            r.get("started_at") or "",
            -r.get("_order", 0),
        ),
        reverse=True,
    )
    for r in rows:
        r.pop("_order", None)
    return {"slug": slug, "count": len(rows), "tasks": rows}


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


class SuggestChatTitleReq(BaseModel):
    chip: str | None = None
    message: str


class SuggestMemoTickerReq(BaseModel):
    message: str
    # Owner-defined list of candidate tickers; if absent we derive them
    # from the analyst's coverage (or the master's watchlist) server-side.
    candidates: list[dict] | None = None


class RunMemoReq(BaseModel):
    ticker: str
    template: str = "pitch-memo"
    message: str | None = None  # optional PM text to persist as the user turn


class CreateChatSessionReq(BaseModel):
    task_id: str
    title: str | None = None


class AppendMessageReq(BaseModel):
    role: str = "pm"
    text: str
    model: str | None = None        # 'claude-sonnet-4-6' | 'claude-opus-4-7' | …
    thinking: str | None = None     # 'standard' | 'extended'


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


@app.post("/api/chats/{owner_key}/tasks/{task_id}/suggest-title")
async def suggest_chat_task_title(owner_key: str, task_id: str, req: SuggestChatTitleReq) -> dict:
    """Infer a task title from a welcome-chip + first PM message, then PATCH it.

    Called fire-and-forget by the UI right after a new task is created.
    Falls back silently to the original title on any LLM failure (the
    helper itself swallows errors and returns the fallback).
    """
    from compass.llm import suggest_task_title

    title = await suggest_task_title(chip=req.chip, message=req.message)
    if not title:
        # Nothing to update — return the task as-is so the UI can no-op.
        owner = chats_list_for_owner(owner_key)
        task = next((t for t in owner.tasks if t.id == task_id), None)
        if task is None:
            raise HTTPException(status_code=404, detail=f"task not found: {task_id}")
        return task.to_dict()
    try:
        task = chats_update_task(owner_key, task_id, title=title)
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


@app.post("/api/chats/{owner_key}/sessions/{session_id}/messages/stream")
async def stream_chat_message(owner_key: str, session_id: str, req: AppendMessageReq):
    """Streaming variant of /messages — emits Server-Sent Events.

    Event shapes:
        event: user_message
        data: {"id": "...", "role": "pm", "text": "...", "ts": "..."}

        event: delta
        data: {"text": "...chunk..."}

        event: done
        data: {"session": {...full session payload with assistant reply...}}

        event: error
        data: {"error": "..."}
    """
    from compass.llm import stream_reply, OAuthUnavailable

    # Persist the PM message up front so the UI can render it immediately
    # off the first SSE event, and so the LLM call sees it in the history.
    try:
        session = chats_append_message(owner_key, session_id, role=req.role, text=req.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    last_user = next((m for m in reversed(session.messages) if m.role == req.role), None)

    async def event_gen():
        # 1. User-message event — UI uses this to replace its optimistic
        #    placeholder with the server's canonical record.
        if last_user is not None:
            yield _sse("user_message", last_user.to_dict())

        # 2. Stream deltas as the LLM produces them.
        chunks: list[str] = []
        try:
            if req.role == "pm" and req.text.strip():
                async for delta in stream_reply(
                    owner_key, session,
                    model=req.model,
                    thinking=req.thinking,
                ):
                    chunks.append(delta)
                    yield _sse("delta", {"text": delta})
        except OAuthUnavailable as exc:
            chunks.append(f"(Claude Code login needed — {exc})")
            yield _sse("delta", {"text": chunks[-1]})
        except Exception as exc:  # noqa: BLE001
            chunks.append(f"(couldn't reach the LLM — {type(exc).__name__}: {exc})")
            yield _sse("delta", {"text": chunks[-1]})

        # 3. Persist the assistant reply (if any) and emit final session.
        final_session = session
        full_text = "".join(chunks).strip()
        if full_text:
            final_session = chats_append_message(
                owner_key, session_id, role="master", text=full_text,
            )
        yield _sse("done", {"session": final_session.to_dict()})

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


def _sse(event: str, data: dict) -> str:
    import json as _json
    return f"event: {event}\ndata: {_json.dumps(data, ensure_ascii=False)}\n\n"


# --- chat-driven memo (skill-based plan + execute) -------------------------


@app.get("/api/chats/{owner_key}/memo/candidates")
def get_chat_memo_candidates(owner_key: str) -> dict:
    """Tickers eligible for a memo run for this chat owner.

    Analyst owner → their coverage. Master owner → the PM's watchlist.
    Hydrated with name/sector from the universe when available so the
    picker can render more than just the symbol.
    """
    candidates = _candidate_tickers_for_owner(owner_key)
    return {"owner_key": owner_key, "count": len(candidates), "candidates": candidates}


class SuggestWorkflowReq(BaseModel):
    """Body for ``POST /api/chats/{owner_key}/suggest-workflow``.

    ``workflows`` is the set of workflows visible to the PM right now —
    pack chips + the generic dropdown. The frontend has the truth about
    what's surfaced in this chat, so it ships the list inline rather than
    forcing the server to recompute it. ``message`` is the PM's typed
    text the router classifies.
    """
    message: str
    workflows: list[dict] = []


@app.post("/api/chats/{owner_key}/suggest-workflow")
async def suggest_chat_workflow(owner_key: str, req: SuggestWorkflowReq) -> dict:
    """Route a free-form PM message to a workflow + ticker, or to chat.

    Two Haiku calls in sequence: one picks the workflow (constrained to
    the list the frontend supplied), one resolves the ticker (constrained
    to the analyst's coverage / watchlist). Either may return ``null`` —
    if the workflow is null we don't bother running ticker resolution,
    since "just chat" doesn't need a target. Display name + description
    come from the supplied workflow list so the confirmation bubble can
    say "Detected: Full Pitch on NVDA" without a second round-trip.
    """
    from compass.llm import suggest_memo_ticker, suggest_workflow

    workflow_command = await suggest_workflow(
        message=req.message,
        workflows=req.workflows,
    )

    if workflow_command is None:
        return {
            "workflow": None,
            "workflow_name": None,
            "workflow_description": None,
            "ticker": None,
        }

    # Echo back the display name + description from the request so the UI
    # doesn't need a second fetch to render the confirmation bubble.
    meta = next(
        (w for w in req.workflows if (w.get("command") or "") == workflow_command),
        None,
    )
    workflow_name = meta.get("name") if meta else workflow_command
    workflow_description = meta.get("description") if meta else None

    # Workflow detected → also try to resolve a ticker so the UI can
    # offer a concrete "Confirm: <workflow> on <ticker>" CTA.
    candidates = _candidate_tickers_for_owner(owner_key)
    ticker = await suggest_memo_ticker(message=req.message, candidates=candidates)

    return {
        "workflow": workflow_command,
        "workflow_name": workflow_name,
        "workflow_description": workflow_description,
        "ticker": ticker,
    }


@app.post("/api/chats/{owner_key}/memo/suggest-ticker")
async def suggest_chat_memo_ticker(owner_key: str, req: SuggestMemoTickerReq) -> dict:
    """Constrained LLM pick: given a PM message + candidate set, return one ticker.

    If ``candidates`` isn't supplied, we derive it from the owner: an
    analyst slug → that analyst's coverage; ``master`` → the watchlist.
    Falls back to the universe-derived `name` for the LLM prompt.
    """
    from compass.llm import suggest_memo_ticker

    candidates = req.candidates
    if not candidates:
        candidates = _candidate_tickers_for_owner(owner_key)
    ticker = await suggest_memo_ticker(message=req.message, candidates=candidates)
    return {"ticker": ticker, "candidate_count": len(candidates)}


def _candidate_tickers_for_owner(owner_key: str) -> list[dict]:
    """Derive memo-eligible tickers for an owner from coverage / watchlist."""
    owner_key = (owner_key or "").strip().lower()
    loaded = load_universe()
    by_symbol = {t.ticker: t for t in (loaded.tickers if loaded else [])}

    symbols: list[str] = []
    if owner_key and owner_key != "master":
        analyst = get_analyst(owner_key)
        if analyst is not None:
            symbols = list(analyst.coverage or [])
    else:
        wl = load_watchlist()
        symbols = [e.ticker for e in wl.tickers]

    out: list[dict] = []
    for s in symbols:
        row = by_symbol.get(s)
        out.append({
            "ticker": s,
            "name": row.name if row is not None else None,
            "sector": row.sector if row is not None else None,
        })
    return out


@app.post("/api/chats/{owner_key}/sessions/{session_id}/memo/stream")
async def stream_chat_memo(owner_key: str, session_id: str, req: RunMemoReq):
    """Plan + run a memo engagement; stream every dispatcher event as SSE.

    The session must already exist (the UI persists the PM's framing
    message first via the regular chat append flow, then triggers this
    endpoint). We persist a ``master`` summary message at the end so the
    transcript reads naturally on reload.

    SSE event shapes:
        event: engagement_opened  data: {analyst, ticker, template, root}
        event: plan_done           data: {task_count, tasks: [...]}
        event: task_start          data: {task_id, skill, ...}
        event: task_done           data: {task_id, skill, elapsed, result}
        event: task_error          data: {task_id, skill, error}
        event: task_blocked        data: {task_id, blocked_by: [...]}
        event: memo_ready          data: {memo_path, memo_text}
        event: done                data: {summary, session}
        event: error               data: {error}
    """
    from compass.chat_skills import run_memo_for_chat

    # Persist the PM message up front if one was supplied (mirrors the
    # streaming chat endpoint so the transcript is consistent).
    if req.message and req.message.strip():
        try:
            chats_append_message(owner_key, session_id, role="pm", text=req.message)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    import asyncio
    import queue as _queue

    q: _queue.Queue = _queue.Queue()
    SENTINEL = object()

    def _on_event(event: dict) -> None:
        q.put(event)

    async def _driver() -> dict:
        try:
            return await run_memo_for_chat(
                owner_key,
                req.ticker,
                template=req.template,
                on_event=_on_event,
            )
        finally:
            q.put(SENTINEL)

    async def event_gen():
        driver_task = asyncio.create_task(_driver())
        loop = asyncio.get_running_loop()
        try:
            while True:
                item = await loop.run_in_executor(None, q.get)
                if item is SENTINEL:
                    break
                ev_type = item.get("type", "event")
                yield _sse(ev_type, item)
        except Exception as exc:  # noqa: BLE001
            yield _sse("error", {"error": f"{type(exc).__name__}: {exc}"})

        # Driver should be done (SENTINEL emitted in `finally`). Await its
        # result for the final summary and to surface any exception.
        try:
            summary = await driver_task
        except Exception as exc:  # noqa: BLE001
            yield _sse("error", {"error": f"{type(exc).__name__}: {exc}"})
            return

        # Persist a master-role summary so the chat transcript carries
        # something durable after reload.
        memo_text = summary.get("memo_text")
        master_text = _format_memo_summary(summary)
        session = None
        if master_text:
            try:
                session = chats_append_message(
                    owner_key, session_id, role="master", text=master_text,
                )
            except ValueError:
                session = None

        yield _sse("done", {
            "summary": {
                "ran": summary.get("ran", 0),
                "skipped": summary.get("skipped", 0),
                "errors": summary.get("errors", 0),
                "analyst": summary.get("analyst"),
                "ticker": summary.get("ticker"),
                "template": summary.get("template"),
                "memo_path": summary.get("memo_path"),
                "has_memo": bool(memo_text),
            },
            "session": session.to_dict() if session is not None else None,
        })

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


def _format_memo_summary(summary: dict) -> str:
    """One-bubble post-run message — full memo if we have it, else a status line.

    On error we surface the first failing task's id + skill + error so the
    PM can act without opening ``.pipeline/run.log``. Subsequent failures
    (often cascading from the first) are noted by count only.
    """
    memo_text = (summary.get("memo_text") or "").strip()
    if memo_text:
        return memo_text
    ticker = summary.get("ticker") or "?"
    errors = summary.get("errors", 0)
    ran = summary.get("ran", 0)
    if errors:
        tasks = summary.get("tasks") or []
        failed = [t for t in tasks if t.get("status") == "error"]
        first = failed[0] if failed else None
        lines = [
            f"Memo run for {ticker} failed: {errors} task error(s), {ran} completed.",
        ]
        if first is not None:
            err = (first.get("error") or "").strip()
            lines.append(
                f"\nFirst failure: **{first.get('id')}** "
                f"(skill `{first.get('skill')}`)"
            )
            if err:
                lines.append(f"\n```\n{err}\n```")
        if len(failed) > 1:
            extras = ", ".join(t.get("id", "?") for t in failed[1:6])
            more = "" if len(failed) <= 6 else f", +{len(failed) - 6} more"
            lines.append(f"\nOther failed tasks: {extras}{more}.")
        lines.append("\nFull trace: `.pipeline/run.log` in the engagement root.")
        return "".join(lines)
    # No errors, no memo_text — chat_skills picks the last completed
    # compose-phase artifact, so this branch only fires when the compose
    # phase produced nothing at all (e.g. blocked by an upstream skip).
    return (
        f"Memo run for {ticker} finished {ran} task(s) but produced no "
        f"compose-phase artifact. Check `.pipeline/run.log` for what was skipped."
    )


@app.post("/api/chats/{owner_key}/sessions/{session_id}/messages")
async def post_chat_message(owner_key: str, session_id: str, req: AppendMessageReq) -> dict:
    """Append a PM message; call Claude (OAuth-only) for the reply."""
    from compass.llm import generate_reply, OAuthUnavailable

    try:
        session = chats_append_message(owner_key, session_id, role=req.role, text=req.text)
        if req.role == "pm" and req.text.strip():
            try:
                reply = await generate_reply(
                    owner_key, session,
                    model=req.model,
                    thinking=req.thinking,
                )
            except OAuthUnavailable as exc:
                reply = f"(Claude Code login needed — {exc})"
            except Exception as exc:  # noqa: BLE001
                # Surface other failures (rate limits, network) verbatim so
                # the user sees the real cause inline.
                reply = f"(couldn't reach the LLM — {type(exc).__name__}: {exc})"
            if reply:
                session = chats_append_message(owner_key, session_id, role="master", text=reply)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return session.to_dict()


# --- skill / template listings ---------------------------------------------


_SAFE_SLUG_RE = __import__("re").compile(r"^[a-z][a-z0-9-]{1,63}$")


def _safe_skill_slug(slug: str) -> bool:
    """Slug rules: lowercase alphanumeric + hyphen, 2-64 chars, no leading
    underscore (``_reference/`` is reserved). Rejects path-traversal etc."""
    if not slug or slug.startswith("_") or slug.startswith("."):
        return False
    return bool(_SAFE_SLUG_RE.match(slug))


def _safe_reference_name(name: str) -> bool:
    """References must be plain filenames ending in ``.md`` — no subdirs."""
    if "/" in name or "\\" in name or ".." in name:
        return False
    return name.endswith(".md") and len(name) <= 96


class UploadSkillPackSpec(BaseModel):
    """Optional pack metadata to ship alongside an uploaded skill.

    When provided the upload endpoint also writes ``packs/<slug>.json``
    and registers a parametric ``<slug>-pitch`` planner template — so
    the newly uploaded skill is immediately hireable from the Hire modal.
    Used by the distill flow (which always proposes a pack for a person).
    """
    name: str                   # display name (e.g. "Charlie Munger")
    title: str = ""             # analyst title (defaults to "Analyst · <sector>")
    sector_hint: str = "Information Technology"
    voice: str = ""             # persona / chat voice for hired analyst
    avatar_color: str = "amber"


class UploadSkillReq(BaseModel):
    """Body for ``POST /api/skills``.

    ``content`` is the full SKILL.md (frontmatter + body). ``references``
    is an optional list of ``{name, content}`` for files that land under
    ``skills/<slug>/references/``. ``overwrite`` must be true to replace
    an existing skill at the same slug. When ``pack`` is provided, a
    ``packs/<slug>.json`` manifest is written and a parametric
    ``<slug>-pitch`` planner template is registered so the skill is
    immediately hireable.
    """
    slug: str
    content: str
    references: list[dict] = []
    overwrite: bool = False
    pack: UploadSkillPackSpec | None = None


class DistillSkillReq(BaseModel):
    """Body for ``POST /api/skills/distill``.

    ``name`` is the famous person whose investment thinking we want to
    distill (e.g. ``"Charlie Munger"``). ``slug`` is the target directory
    name under ``skills/`` if/when the user later saves the result. The
    endpoint itself does *not* write to disk — the proposed SKILL.md is
    returned for review.
    """
    name: str
    slug: str


@app.post("/api/skills/distill")
async def post_distill_skill(req: DistillSkillReq) -> dict:
    """Author a SKILL.md from a famous person's Wikipedia page.

    The endpoint fetches the wiki extract, then runs a one-shot Claude
    call (OAuth via claude-agent-sdk, same as the chat surface) with the
    bundled Buffett skill as the shape template. Returns the proposed
    SKILL.md content so the frontend can show it in the upload form for
    review + edit before the user commits it to disk via the regular
    upload endpoint.
    """
    from compass.distill import distill_skill_from_name

    if not _safe_skill_slug(req.slug):
        raise HTTPException(
            status_code=400,
            detail="slug must match ^[a-z][a-z0-9-]{1,63}$ (lowercase alphanumeric + hyphen)",
        )
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="name is required")

    try:
        result = await distill_skill_from_name(req.name.strip(), req.slug)
    except ValueError as exc:
        # Wikipedia page not found.
        raise HTTPException(status_code=404, detail=str(exc))
    except RuntimeError as exc:
        # SDK / OAuth failure — surface as 503 so the UI can suggest action.
        raise HTTPException(status_code=503, detail=str(exc))

    result["suggested_pack"] = _suggested_pack_for(req.name.strip())
    return result


def _suggested_pack_for(person_name: str) -> dict[str, str]:
    """Default pack metadata used by both the JSON and SSE distill endpoints."""
    return {
        "name": person_name,
        "title": "Value Investor",
        "sector_hint": "Information Technology",
        "avatar_color": "amber",
        "voice": (
            f"In the voice of {person_name}. Plain-spoken, "
            f"first-principles. Inform, don't advise — no buy/sell calls. "
            f"Cite primary sources. Honest about what's outside the circle."
        ),
    }


@app.post("/api/skills/distill/stream")
async def post_distill_skill_stream(req: DistillSkillReq):
    """SSE-streamed distillation — emits progress events through the slow path.

    Event sequence on success::

        event: wiki_start    data: {name}
        event: wiki_done     data: {chars}
        event: author_start  data: {model}
        event: say           data: {delta, total_chars}  (many)
        event: author_done   data: {chars}
        event: done          data: {slug, name, wiki_chars, skill_md, suggested_pack}

    On failure (wiki missing / SDK error) emits a single ``error`` event.
    """
    from compass.distill import distill_skill_from_name

    if not _safe_skill_slug(req.slug):
        raise HTTPException(
            status_code=400,
            detail="slug must match ^[a-z][a-z0-9-]{1,63}$ (lowercase alphanumeric + hyphen)",
        )
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="name is required")

    import asyncio
    import queue as _queue

    q: _queue.Queue = _queue.Queue()
    SENTINEL = object()

    def _on_event(event: dict) -> None:
        q.put(event)

    async def _driver() -> dict | None:
        try:
            return await distill_skill_from_name(
                req.name.strip(), req.slug, on_event=_on_event,
            )
        except (ValueError, RuntimeError) as exc:
            # Surface so the consumer can emit a final ``error`` event below.
            q.put({"type": "error", "error": str(exc)})
            return None
        finally:
            q.put(SENTINEL)

    async def event_gen():
        driver_task = asyncio.create_task(_driver())
        loop = asyncio.get_running_loop()
        try:
            while True:
                item = await loop.run_in_executor(None, q.get)
                if item is SENTINEL:
                    break
                ev_type = item.get("type", "event")
                yield _sse(ev_type, item)
        except Exception as exc:  # noqa: BLE001
            yield _sse("error", {"error": f"{type(exc).__name__}: {exc}"})
            return

        try:
            result = await driver_task
        except Exception as exc:  # noqa: BLE001
            yield _sse("error", {"error": f"{type(exc).__name__}: {exc}"})
            return

        if result is not None:
            result["suggested_pack"] = _suggested_pack_for(req.name.strip())
            yield _sse("done", result)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no", "Cache-Control": "no-cache"},
    )


@app.post("/api/skills", status_code=201)
def post_skill(req: UploadSkillReq) -> dict:
    """Upload a skill (SKILL.md + optional references/) into ``skills/<slug>/``.

    Frontmatter inference applies at *load* time — an upload with only
    ``name`` + ``description`` (Anthropic-style) loads with ``runner: agent``
    and ``allowed-tools: [Read]`` inferred. The file is written as-is so
    the user can keep editing it on disk; the loader does the wrapping.
    """
    from compass.skills import SKILLS_DIR, load_skill

    if not _safe_skill_slug(req.slug):
        raise HTTPException(
            status_code=400,
            detail="slug must match ^[a-z][a-z0-9-]{1,63}$ (lowercase alphanumeric + hyphen)",
        )
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="SKILL.md content is empty")

    skill_dir = SKILLS_DIR / req.slug
    if skill_dir.exists() and not req.overwrite:
        raise HTTPException(
            status_code=409,
            detail=f"skill {req.slug!r} already exists. Re-POST with overwrite=true to replace.",
        )

    skill_dir.mkdir(parents=True, exist_ok=True)
    (skill_dir / "SKILL.md").write_text(req.content, encoding="utf-8")

    skipped_refs: list[str] = []
    if req.references:
        refs_dir = skill_dir / "references"
        refs_dir.mkdir(exist_ok=True)
        for ref in req.references:
            name = str(ref.get("name", "")).strip()
            content = str(ref.get("content", ""))
            if not _safe_reference_name(name):
                skipped_refs.append(name or "(unnamed)")
                continue
            (refs_dir / name).write_text(content, encoding="utf-8")

    # Validate by loading. If the frontmatter is malformed, surface the error.
    try:
        spec = load_skill(req.slug)
    except Exception as exc:  # noqa: BLE001
        # Don't leave a broken skill on disk — clean up.
        import shutil
        shutil.rmtree(skill_dir, ignore_errors=True)
        raise HTTPException(
            status_code=400,
            detail=f"skill failed to load after write: {type(exc).__name__}: {exc}",
        )

    # If the caller supplied pack metadata (typically the distill flow),
    # also create a hireable persona: write ``packs/<slug>.json`` and
    # register a parametric ``<slug>-pitch`` template so the dispatcher
    # can execute the workflow immediately.
    created_pack_id: str | None = None
    if req.pack is not None:
        from compass.packs import PACKS_DIR
        from compass.planner import register_persona_template
        pack_id = req.slug
        PACKS_DIR.mkdir(parents=True, exist_ok=True)
        pack_manifest = {
            "id": pack_id,
            "name": req.pack.name,
            "title": req.pack.title or f"Analyst · {req.pack.sector_hint}",
            "sector_hint": req.pack.sector_hint,
            "avatar_color": req.pack.avatar_color,
            "voice": req.pack.voice,
            "skills": [req.slug],
            "default_template": f"{req.slug}-pitch",
            "workflows": [
                {
                    "command": f"{req.slug}-pitch",
                    "name": "Full Pitch",
                    "description": (
                        f"Complete {req.pack.name} analysis on a covered "
                        f"ticker using the {req.slug} skill at compose."
                    ),
                },
            ],
        }
        (PACKS_DIR / f"{pack_id}.json").write_text(
            json.dumps(pack_manifest, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        register_persona_template(req.slug, req.pack.name)
        created_pack_id = pack_id

    return {
        "slug": spec.slug,
        "name": spec.name,
        "phase": spec.phase,
        "runner": spec.runner,
        "description": spec.description,
        "allowed_tools": spec.allowed_tools,
        "needs": spec.needs,
        "output": spec.output,
        "model": spec.model,
        "max_turns": spec.max_turns,
        "used_by": [],
        "in_packs": [created_pack_id] if created_pack_id else [],
        "skipped_references": skipped_refs,
        "pack_created": created_pack_id,
    }


@app.get("/api/skills")
def get_skills() -> list[dict]:
    """Catalog of skills with cross-references (analysts using them, packs shipping them).

    The library view consumes this to render skill cards with provenance.
    Each skill carries enough to drive filtering (phase/runner), authoring
    cues (needs/output), and adoption signals (used_by/in_packs).
    """
    # Reverse-index: which analyst slugs list this skill?
    used_by: dict[str, list[str]] = {}
    for a in list_analysts():
        for slug in (a.skills or []):
            used_by.setdefault(slug, []).append(a.slug)
    # Reverse-index: which packs ship this skill?
    in_packs: dict[str, list[str]] = {}
    for pack in list_packs():
        for slug in pack.skills:
            in_packs.setdefault(slug, []).append(pack.id)
    return [
        {
            "slug": s.slug,
            "name": s.name,
            "phase": s.phase,
            "runner": s.runner,
            "description": s.description,
            "allowed_tools": s.allowed_tools,
            "needs": s.needs,
            "output": s.output,
            "model": s.model,
            "max_turns": s.max_turns,
            "used_by": used_by.get(s.slug, []),
            "in_packs": in_packs.get(s.slug, []),
        }
        for s in list_skills()
    ]


@app.get("/api/skills/{slug}")
def get_skill(slug: str) -> dict:
    """Single skill with the full SKILL.md body and reference filenames.

    Powers the Skills library's detail modal. The catalog endpoint
    (``/api/skills``) omits ``body`` and ``references`` to keep listings
    lightweight; this endpoint surfaces them when the user actually
    clicks into a card.
    """
    from compass.skills import load_skill
    try:
        spec = load_skill(slug)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    # Reverse-index used_by + in_packs the same way ``get_skills`` does
    # so the detail view doesn't need a second round-trip to figure out
    # who adopted this skill.
    used_by = [a.slug for a in list_analysts() if slug in (a.skills or [])]
    in_packs = [p.id for p in list_packs() if slug in p.skills]

    references: list[str] = []
    if spec.references_dir.exists():
        references = sorted(
            p.name for p in spec.references_dir.iterdir()
            if p.is_file() and p.name.endswith(".md")
        )

    return {
        "slug": spec.slug,
        "name": spec.name,
        "phase": spec.phase,
        "runner": spec.runner,
        "description": spec.description,
        "allowed_tools": spec.allowed_tools,
        "needs": spec.needs,
        "output": spec.output,
        "model": spec.model,
        "max_turns": spec.max_turns,
        "used_by": used_by,
        "in_packs": in_packs,
        "body": spec.body,
        "references": references,
        "path": str(spec.path),
    }


@app.get("/api/templates")
def get_templates() -> list[str]:
    return list_templates()


@app.get("/api/templates/detail")
def get_templates_detail() -> dict:
    """Workflows catalog — every planner template with metadata.

    Powers the Library → Workflows tab. Each entry carries the task count,
    phases hit, ordered skill list, the final compose-phase output path,
    and (when applicable) the pack that owns it + the pack's workflow
    description. Generic templates (``pitch-memo``, ``earnings-reaction``,
    ``maintenance-refresh``, ``deep-dive``) have no owning pack and
    surface with ``pack_id: null``.
    """
    from compass.planner import inspect_template

    # Reverse-index: which pack ships this workflow command, and what
    # display label + description did the pack give it?
    pack_meta: dict[str, dict] = {}
    for pack in list_packs():
        for wf in pack.workflows:
            pack_meta[wf.command] = {
                "pack_id": pack.id,
                "pack_name": pack.name,
                "display_name": wf.name,
                "description": wf.description,
            }

    workflows: list[dict] = []
    for name in list_templates():
        try:
            info = inspect_template(name)
        except Exception as exc:  # noqa: BLE001 — never let one bad template hide the rest
            workflows.append({"name": name, "error": str(exc)})
            continue
        meta = pack_meta.get(name)
        info["pack_id"] = meta["pack_id"] if meta else None
        info["pack_name"] = meta["pack_name"] if meta else None
        info["display_name"] = meta["display_name"] if meta else name
        info["description"] = meta["description"] if meta else None
        workflows.append(info)
    return {"workflows": workflows}


# --- data inventory (Library → Data tab) ------------------------------------


_DATA_CATEGORY_RULES: list[tuple[str, str, str]] = [
    # (path_prefix, category_id, display type when no better info)
    ("corpus/filings/",      "filings",     "Filing"),
    ("corpus/snapshots/",    "snapshots",   "Snapshot"),
    ("corpus/transcripts/",  "transcripts", "Transcript"),
    ("corpus/news/",         "news",        "News"),
    ("corpus/ownership/",    "ownership",   "Ownership"),
    ("corpus/earnings/",     "earnings",    "Earnings history"),
    ("corpus/research/",     "research",    "Web research"),
]

_DATE_RE = __import__("re").compile(r"(\d{4}-\d{2}-\d{2})")


def _data_category(rel: str) -> tuple[str, str] | None:
    """Classify a corpus file by path; returns ``(category_id, type_label)``."""
    for prefix, cat, label in _DATA_CATEGORY_RULES:
        if rel.startswith(prefix):
            # Filings carry the form name in the path: corpus/filings/<FORM>/...
            if cat == "filings":
                parts = rel.split("/")
                form = parts[2] if len(parts) > 2 else label
                return cat, form
            # Ownership splits into insider vs institutional by filename.
            if cat == "ownership":
                name = rel.rsplit("/", 1)[-1]
                if name.startswith("insider"):
                    return cat, "Insider trades"
                if name.startswith("institutional"):
                    return cat, "Institutional holders"
            return cat, label
    return None


def _data_date(rel: str, mtime: float) -> str:
    """Best-effort date for an artifact: filename date first, mtime fallback."""
    m = _DATE_RE.search(rel)
    if m:
        return m.group(1)
    return datetime.fromtimestamp(mtime, tz=timezone.utc).date().isoformat()


def _fmt_size(n: int) -> str:
    if n < 1024:
        return f"{n} B"
    if n < 1024 * 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n / (1024 * 1024):.1f} MB"


@app.get("/api/data")
def get_data_inventory() -> dict:
    """Inventory of fetched data across every engagement on disk.

    Walks each engagement's ``corpus/`` tree, classifies files by path
    prefix (filings / snapshots / news / transcripts / ownership /
    earnings / research), and returns two views the Library → Data tab
    consumes: ``inventory`` rollups (count + tickers + last updated per
    category) and a flat newest-first ``items`` list.
    """
    from compass.engagement import engagements_root
    from datetime import datetime, timezone  # noqa: F401 — see top of file
    root = engagements_root()
    items: list[dict] = []
    by_cat: dict[str, dict] = {}

    if not root.exists():
        return {"inventory": [], "items": []}

    for analyst_dir in sorted(root.iterdir()):
        if not analyst_dir.is_dir():
            continue
        for ticker_dir in sorted(analyst_dir.iterdir()):
            if not ticker_dir.is_dir():
                continue
            corpus = ticker_dir / "corpus"
            if not corpus.exists():
                continue
            for p in corpus.rglob("*"):
                if not p.is_file():
                    continue
                rel = p.relative_to(ticker_dir).as_posix()
                classified = _data_category(rel)
                if classified is None:
                    continue
                category, type_label = classified
                stat = p.stat()
                items.append({
                    "category": category,
                    "ticker": ticker_dir.name,
                    "analyst": analyst_dir.name,
                    "path": rel,
                    "type": type_label,
                    "date": _data_date(rel, stat.st_mtime),
                    "size": _fmt_size(stat.st_size),
                    "modified_at": stat.st_mtime,
                })
                entry = by_cat.setdefault(category, {
                    "count": 0, "tickers": set(), "last_mtime": 0.0,
                })
                entry["count"] += 1
                entry["tickers"].add(ticker_dir.name)
                entry["last_mtime"] = max(entry["last_mtime"], stat.st_mtime)

    items.sort(key=lambda o: o["modified_at"], reverse=True)
    inventory = [
        {
            "category": cat,
            "count": entry["count"],
            "tickers": sorted(entry["tickers"]),
            "last_updated": (
                datetime.fromtimestamp(entry["last_mtime"], tz=timezone.utc).date().isoformat()
                if entry["last_mtime"] else None
            ),
        }
        for cat, entry in sorted(by_cat.items())
    ]
    return {"inventory": inventory, "items": items}


# --- packs (persona bundles) ------------------------------------------------


@app.get("/api/packs")
def get_packs() -> dict:
    """List every persona pack on disk.

    Used by the Hire modal (pack selector) and by the chat surface (to
    render an active analyst's workflow chips when the analyst was hired
    from a pack).
    """
    return {"packs": [p.to_dict() for p in list_packs()]}


@app.get("/api/packs/{pack_id}")
def get_pack_by_id(pack_id: str) -> dict:
    """One pack by id. 404 if not found."""
    pack = get_pack(pack_id)
    if pack is None:
        raise HTTPException(status_code=404, detail=f"pack not found: {pack_id!r}")
    return pack.to_dict()


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


# --- dashboard aggregations -------------------------------------------------
#
# Used by the home Dashboard view. Each endpoint walks every engagement on
# disk and emits a flat, presentation-ready list. Cheap enough at typical
# pod sizes (a few analysts × few tickers × few dozen tasks) — revisit if
# it ever becomes hot.


def _parse_iso_to_epoch(s: str) -> float:
    if not s:
        return 0.0
    try:
        from datetime import datetime
        return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return 0.0


_CITATION_SOURCE_RE = re.compile(r"\(source:\s*[^)]+\)", re.IGNORECASE)


def _memo_excerpt(text: str, *, max_chars: int = 220) -> str:
    """First non-heading, non-empty paragraph from a memo, capped to ``max_chars``."""
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or line.startswith("---"):
            continue
        if len(line) > max_chars:
            return line[:max_chars].rstrip() + "…"
        return line
    return ""


@app.get("/api/dashboard/active-tasks")
def get_dashboard_active_tasks(
    limit: int = Query(20, ge=1, le=100),
) -> dict:
    """Flat list of in-progress + pending engagement tasks across the pod.

    Sorted: in-progress first (longest-running at top so the slow ones are
    visible), then pending. ``elapsed_sec`` measured from ``started_at``
    (0 for not-yet-started pending tasks).
    """
    from datetime import datetime, timezone

    items: list[dict] = []
    root = engagements_root()
    if not root.exists():
        return {"count": 0, "tasks": []}

    now_epoch = datetime.now(timezone.utc).timestamp()

    for analyst_dir in root.iterdir():
        if not analyst_dir.is_dir():
            continue
        for ticker_dir in analyst_dir.iterdir():
            if not ticker_dir.is_dir():
                continue
            tasks_path = ticker_dir / ".pipeline" / "tasks.json"
            if not tasks_path.exists():
                continue
            try:
                payload = json.loads(tasks_path.read_text(encoding="utf-8"))
                tasks = payload.get("tasks") or []
            except (json.JSONDecodeError, OSError):
                continue
            for t in tasks:
                status = str(t.get("status") or "").strip()
                if status not in ("in-progress", "pending"):
                    continue
                started = str(t.get("started_at") or "")
                started_epoch = _parse_iso_to_epoch(started)
                elapsed = (now_epoch - started_epoch) if started_epoch > 0 else 0.0
                items.append({
                    "id": f"{analyst_dir.name}/{ticker_dir.name}/{t.get('id') or ''}",
                    "task_id": str(t.get("id") or ""),
                    "title": str(t.get("title") or t.get("skill") or "(untitled task)"),
                    "skill": str(t.get("skill") or ""),
                    "stage": str(t.get("stage") or ""),
                    "status": status,
                    "analyst": analyst_dir.name,
                    "ticker": ticker_dir.name,
                    "started_at": started,
                    "elapsed_sec": int(elapsed),
                })

    items.sort(key=lambda r: (
        0 if r["status"] == "in-progress" else 1,
        -r["elapsed_sec"],
    ))
    capped = items[:limit]
    return {"count": len(capped), "tasks": capped}


@app.get("/api/dashboard/recent-memos")
def get_dashboard_recent_memos(
    limit: int = Query(10, ge=1, le=50),
) -> dict:
    """Most-recently-modified memo files across every engagement.

    Each row is presentation-ready: title (``<TICKER> · <type>``), a
    short excerpt drawn from the first non-heading line, citation count
    (rough — counts ``(source: …)`` mentions), and the engagement
    coordinates so the UI can route a click.
    """
    from datetime import datetime, timezone

    items: list[dict] = []
    root = engagements_root()
    if not root.exists():
        return {"count": 0, "memos": []}

    for analyst_dir in root.iterdir():
        if not analyst_dir.is_dir():
            continue
        for ticker_dir in analyst_dir.iterdir():
            if not ticker_dir.is_dir():
                continue
            memos_dir = ticker_dir / "memos"
            if not memos_dir.exists():
                continue
            for memo_type_dir in memos_dir.iterdir():
                if not memo_type_dir.is_dir():
                    continue
                for memo_path in memo_type_dir.glob("*.md"):
                    try:
                        text = memo_path.read_text(encoding="utf-8", errors="replace")
                        stat = memo_path.stat()
                    except OSError:
                        continue
                    rel_path = memo_path.relative_to(ticker_dir).as_posix()
                    items.append({
                        "id": f"{analyst_dir.name}/{ticker_dir.name}/{rel_path}",
                        "title": f"{ticker_dir.name} · {memo_type_dir.name}",
                        "excerpt": _memo_excerpt(text),
                        "analyst": analyst_dir.name,
                        "ticker": ticker_dir.name,
                        "type": memo_type_dir.name,
                        "path": rel_path,
                        # Date: use the YYYY-MM-DD stem when present, else
                        # the file's modified date in UTC.
                        "date": (
                            memo_path.stem
                            if memo_path.stem[:4].isdigit()
                            else datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).date().isoformat()
                        ),
                        "citation_count": len(_CITATION_SOURCE_RE.findall(text)),
                        "modified_at": stat.st_mtime,
                    })

    items.sort(key=lambda r: r["modified_at"], reverse=True)
    capped = items[:limit]
    return {"count": len(capped), "memos": capped}


# --- data-source specs ------------------------------------------------------
#
# The Data Engineer chat surface produces a markdown spec at the end of a
# scoping conversation; the PM saves it via this endpoint. Specs land at
# ``specs/data/<slug>.md`` at the repo root (committable, reviewable),
# NOT under the gitignored ``data/`` dir.
#
# v1 deliberately does not auto-author a fetch skill from the spec — the
# spec is the input to a later step (human, or a future distill-style
# agent for code skills).


class SaveDataSpecReq(BaseModel):
    slug: str
    content: str


_SPEC_SLUG_RE = re.compile(r"^[a-z][a-z0-9-]{1,63}$")


@app.post("/api/specs/data", status_code=201)
def post_save_data_spec(req: SaveDataSpecReq) -> dict:
    """Save a Data-Engineer-produced spec to ``specs/data/<slug>.md``."""
    slug = (req.slug or "").strip().lower()
    if not _SPEC_SLUG_RE.match(slug):
        raise HTTPException(
            status_code=400,
            detail="slug must start with a letter, then lowercase letters / digits / hyphens (max 64 chars)",
        )
    if not (req.content or "").strip():
        raise HTTPException(status_code=400, detail="content cannot be empty")
    _SPECS_DIR.mkdir(parents=True, exist_ok=True)
    spec_path = _SPECS_DIR / f"{slug}.md"
    spec_path.write_text(req.content, encoding="utf-8")
    return {
        "slug": slug,
        "path": str(spec_path.relative_to(_SPECS_DIR.parent.parent)).replace("\\", "/"),
        "bytes": spec_path.stat().st_size,
    }


@app.get("/api/specs/data")
def get_data_specs() -> dict:
    """List every saved data-source spec (newest first)."""
    if not _SPECS_DIR.exists():
        return {"count": 0, "specs": []}
    rows = []
    for p in _SPECS_DIR.glob("*.md"):
        rows.append({
            "slug": p.stem,
            "path": str(p.relative_to(_SPECS_DIR.parent.parent)).replace("\\", "/"),
            "bytes": p.stat().st_size,
            "modified_at": p.stat().st_mtime,
        })
    rows.sort(key=lambda r: r["modified_at"], reverse=True)
    return {"count": len(rows), "specs": rows}


# --- static SPA -------------------------------------------------------------


if _STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=_STATIC_DIR), name="static")


@app.get("/")
def index() -> FileResponse:
    """Serve the single-page app (slice 8 vintage; UI bridge is slice 19)."""
    return FileResponse(_STATIC_DIR / "index.html")
