"""Compass CLI — analyst engagements driven by skills.

Slice-18 rewrite. The old ask/fetch/summarize/research/evidence command
set is gone; the new surface is built around engagements:

    compass plan <TICKER> <template> [--analyst ...]
    compass run  <TICKER> [<template>] [--analyst ...] [--phase ...]
    compass status <TICKER> [--analyst ...]
    compass skills           # list discovered skills
    compass templates        # list known planner templates
    compass engagements      # list materialized engagements
    compass serve            # start the FastAPI app (web UI in slice 19)
    compass ask "<prompt>"   # back-compat smoke test (one-shot Claude call)
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

import typer
from dotenv import load_dotenv

from compass import __version__
from compass.dispatcher import run_engagement
from compass.engagement import (
    DEFAULT_ANALYST_FALLBACK,
    Engagement,
    list_engagements,
)
from compass.universe import (
    ALLOWED_EXCHANGES,
    CAP_BUCKET_LABELS,
    GICS_SECTORS,
    REGIONS,
    Ticker,
    enrich_existing,
    load_universe,
    refresh as refresh_universe,
    universe_path,
)
from compass.planner import list_templates, plan as plan_template
from compass.skills import list_skills

load_dotenv()


app = typer.Typer(
    name="compass",
    help="Compass — your AI analyst team.",
    no_args_is_help=True,
    add_completion=False,
)


def _version_callback(value: bool) -> None:
    if value:
        typer.echo(__version__)
        raise typer.Exit()


@app.callback()
def _root(
    version: bool = typer.Option(
        False,
        "--version",
        "-V",
        help="Show version and exit.",
        callback=_version_callback,
        is_eager=True,
    ),
) -> None:
    """Compass — your AI analyst team."""


# ---------------------------------------------------------------------------
# Plan / run / status
# ---------------------------------------------------------------------------


@app.command()
def plan(
    ticker: str = typer.Argument(..., help="Ticker (e.g. NVDA, SOC)."),
    template: str = typer.Argument(
        ...,
        help="Template name. Use `compass templates` to list.",
    ),
    analyst: str = typer.Option(
        None,
        "--analyst",
        "-a",
        help=f"Analyst slug. Defaults to a per-ticker mapping (fallback: {DEFAULT_ANALYST_FALLBACK}).",
    ),
) -> None:
    """Generate `.pipeline/tasks.json` for an engagement using a named template."""
    engagement = Engagement.open(ticker, analyst=analyst)
    if template not in list_templates():
        typer.secho(
            f"Unknown template: {template}. Known: {list_templates()}",
            fg=typer.colors.RED,
            err=True,
        )
        sys.exit(2)
    tasks = plan_template(engagement, template)
    engagement.save_tasks(tasks, template=template)
    typer.echo(
        f"Planned {len(tasks)} tasks for {engagement.ticker} "
        f"(analyst {engagement.analyst_slug}, template {template})."
    )
    typer.echo(f"Wrote {engagement.tasks_path}")


@app.command("run")
def run_cmd(
    ticker: str = typer.Argument(..., help="Ticker (e.g. NVDA, SOC)."),
    template: str = typer.Argument(
        None,
        help="Template name. If omitted, re-runs the engagement's existing tasks.json.",
    ),
    analyst: str = typer.Option(
        None, "--analyst", "-a",
        help="Override the per-ticker default analyst slug.",
    ),
    phase: str = typer.Option(
        None,
        "--phase",
        "-p",
        help="Run only tasks in this phase (setup/ingest/analyze/compose/maintain).",
    ),
    only: str = typer.Option(
        None,
        "--only",
        help="Run only this comma-separated list of task IDs.",
    ),
    stop_on_error: bool = typer.Option(
        True, "--stop-on-error/--no-stop-on-error",
        help="Stop after the first failing task (default).",
    ),
) -> None:
    """Run an engagement end-to-end: plan (if given a template) then dispatch tasks.

    Examples:

        compass run NVDA pitch-memo
        compass run SOC pitch-memo --analyst david-park
        compass run NVDA --phase compose
        compass run NVDA --only ingest-10k,ingest-snapshot
    """
    engagement = Engagement.open(ticker, analyst=analyst)
    if template:
        if template not in list_templates():
            typer.secho(
                f"Unknown template: {template}. Known: {list_templates()}",
                fg=typer.colors.RED,
                err=True,
            )
            sys.exit(2)
        tasks = plan_template(engagement, template)
        engagement.save_tasks(tasks, template=template)
        typer.echo(
            f"Planned {len(tasks)} tasks ({template}) for {engagement.ticker} "
            f"under analyst {engagement.analyst_slug}.",
        )
    if not engagement.tasks_path.exists():
        typer.secho(
            "No tasks.json yet. Pass a template name, or `compass plan` first.",
            fg=typer.colors.RED,
            err=True,
        )
        sys.exit(2)

    only_ids = [s.strip() for s in only.split(",")] if only else None

    summary = asyncio.run(
        run_engagement(
            engagement,
            only_phase=phase,
            only_task_ids=only_ids,
            stop_on_error=stop_on_error,
        )
    )
    typer.echo("")
    typer.echo(
        f"Ran {summary['ran']} task(s); skipped {summary['skipped']}; "
        f"errors {summary['errors']}."
    )
    typer.echo(f"Engagement: {engagement.root}")


@app.command()
def status(
    ticker: str = typer.Argument(..., help="Ticker."),
    analyst: str = typer.Option(None, "--analyst", "-a"),
) -> None:
    """Show the engagement's brief snapshot + task statuses."""
    engagement = Engagement.open(ticker, analyst=analyst)
    brief = engagement.load_brief()
    tasks = engagement.load_tasks()

    typer.echo(f"engagement: {engagement.root}")
    typer.echo(f"analyst:    {engagement.analyst_slug}")
    typer.echo(f"ticker:     {engagement.ticker}")
    typer.echo("")
    if brief:
        typer.echo(f"thesis: {brief.get('thesis_one_liner') or brief.get('thesisOneLiner') or '(none)'}")
    else:
        typer.echo("brief:  (not yet built)")
    typer.echo("")
    if not tasks:
        typer.echo("tasks.json: (not yet planned)")
        return
    by_stage: dict[str, list] = {}
    for t in tasks:
        by_stage.setdefault(t.stage, []).append(t)
    for stage in ("setup", "ingest", "analyze", "compose", "maintain"):
        items = by_stage.get(stage, [])
        if not items:
            continue
        typer.echo(f"[{stage.upper()}]")
        for t in items:
            marker = {
                "pending": " ",
                "in-progress": ">",
                "done": "x",
                "error": "!",
            }.get(t.status, "?")
            typer.echo(f"  [{marker}] {t.id:<26} {t.skill:<24} {t.title}")
        typer.echo("")


# ---------------------------------------------------------------------------
# Listings
# ---------------------------------------------------------------------------


@app.command()
def skills() -> None:
    """List every skill discovered under skills/."""
    items = list_skills()
    if not items:
        typer.secho("No skills found under skills/.", fg=typer.colors.YELLOW)
        return
    typer.echo(f"{'PHASE':<10} {'SLUG':<24} {'RUNNER':<14}  DESCRIPTION")
    for s in items:
        desc = s.description if len(s.description) <= 80 else s.description[:77] + "..."
        typer.echo(f"{s.phase:<10} {s.slug:<24} {s.runner:<14}  {desc}")


@app.command()
def templates() -> None:
    """List planner templates."""
    for name in list_templates():
        typer.echo(name)


@app.command()
def engagements() -> None:
    """List engagements on disk (newest first)."""
    items = list_engagements()
    if not items:
        typer.secho("No engagements yet. Try `compass run NVDA pitch-memo`.", fg=typer.colors.YELLOW)
        return
    typer.echo(f"{'ANALYST':<16} {'TICKER':<8} {'BRIEF':<6} {'TASKS':<6} PATH")
    for e in items:
        typer.echo(
            f"{e['analyst']:<16} {e['ticker']:<8} "
            f"{'yes' if e['has_brief'] else 'no':<6} "
            f"{'yes' if e['has_tasks'] else 'no':<6} "
            f"{e['path']}"
        )


# ---------------------------------------------------------------------------
# Universe (US ticker pool)
# ---------------------------------------------------------------------------


@app.command("refresh-universe")
def refresh_universe_cmd(
    enrich_top: int = typer.Option(
        0,
        "--enrich-top",
        help=(
            "How many of the top tickers to enrich with sector / industry / "
            "market-cap via yfinance. 0 = no enrichment (fast). 500 ≈ 10 min."
        ),
    ),
) -> None:
    """Re-fetch the US ticker universe from SEC and write the seed JSON.

    The output lands at ``compass/data/universe/us-tickers.json`` and is
    consumed by the FastAPI ``/api/universe`` endpoint plus the
    ``compass universe`` listing.

    Requires ``COMPASS_SEC_USER_NAME`` and ``COMPASS_SEC_USER_EMAIL`` to be
    set (SEC requires a User-Agent on every request).
    """
    typer.echo(
        f"Fetching SEC ticker list (NYSE / NASDAQ / AMEX) ..."
    )

    last_pct = -1

    def progress(i: int, total: int, t: Ticker) -> None:
        nonlocal last_pct
        pct = int(100 * i / max(total, 1))
        if pct != last_pct and pct % 5 == 0:
            typer.echo(
                f"  enriched {i}/{total}  ({pct}%)  latest: {t.ticker:<6} {t.name[:40]}",
            )
            last_pct = pct

    try:
        universe = refresh_universe(
            enrich_top=enrich_top if enrich_top > 0 else 0,
            on_progress=progress if enrich_top > 0 else None,
        )
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)

    typer.echo("")
    typer.echo(f"Saved {len(universe.tickers)} tickers to {universe_path()}")
    if enrich_top > 0:
        enriched = sum(1 for t in universe.tickers if t.sector is not None)
        typer.echo(f"Enriched with sector data: {enriched}")


@app.command()
def universe(
    sector: str = typer.Option(None, "--sector", "-s", help="Filter by sector."),
    exchange: str = typer.Option(None, "--exchange", "-e", help="Filter by exchange."),
    cap_bucket: str = typer.Option(None, "--cap", "-c", help="Filter by cap bucket (blue-chip/large/mid/small/micro)."),
    query: str = typer.Option(None, "--query", "-q", help="Ranked search on ticker / name."),
    limit: int = typer.Option(40, "--limit", "-n", help="Max rows to show."),
) -> None:
    """List the US ticker universe. Run `compass refresh-universe` first."""
    from compass.universe import filter_tickers

    loaded = load_universe()
    if loaded is None:
        typer.secho(
            "No universe seed yet. Run `compass refresh-universe` first.",
            fg=typer.colors.YELLOW,
        )
        sys.exit(2)

    matched = filter_tickers(
        loaded,
        sector=sector,
        exchange=exchange,
        cap_bucket=cap_bucket,
        query=query,
    )
    rows = matched[:limit]
    if not rows:
        typer.secho("No matches.", fg=typer.colors.YELLOW)
        return

    typer.echo(f"{'TICKER':<8} {'EXCH':<7} {'NAME':<40} {'SECTOR':<25} CAP")
    for t in rows:
        cap = CAP_BUCKET_LABELS.get(t.cap_bucket or "", "—")
        sector_v = t.sector or "—"
        typer.echo(
            f"{t.ticker:<8} {t.exchange:<7} {t.name[:40]:<40} {sector_v[:25]:<25} {cap}"
        )
    typer.echo("")
    typer.echo(
        f"({len(rows)} of {len(matched)} matched · {len(loaded.tickers)} total · as of {loaded.as_of})"
    )


@app.command("enrich-universe")
def enrich_universe_cmd(
    count: int = typer.Option(
        300,
        "--count",
        "-n",
        help="How many additional tickers to enrich in this run.",
    ),
    start: int = typer.Option(
        0,
        "--start",
        help="Skip this many already-unenriched tickers (resume).",
    ),
) -> None:
    """Extend enrichment without re-fetching the SEC list.

    Each call enriches the next ``count`` unenriched tickers and saves
    progress every 50 rows, so a long crawl that hits a rate limit
    preserves what it got. Run this repeatedly to grow coverage beyond
    the shipped seed.
    """
    last_pct = -1

    def progress(i: int, total: int, t: Ticker) -> None:
        nonlocal last_pct
        pct = int(100 * i / max(total, 1))
        if pct != last_pct and pct % 5 == 0:
            typer.echo(f"  enriched {i}/{total}  ({pct}%)  latest: {t.ticker:<6} {t.name[:40]}")
            last_pct = pct

    try:
        universe = enrich_existing(start=start, limit=count, on_progress=progress)
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)
    enriched = sum(1 for t in universe.tickers if t.cap_bucket is not None)
    typer.echo("")
    typer.echo(f"Total enriched: {enriched} of {len(universe.tickers)}.")


@app.command()
def regions() -> None:
    """List supported regions."""
    from compass.universe import REGIONS

    for r in REGIONS:
        typer.echo(r)


@app.command()
def sectors() -> None:
    """List GICS sectors used for filtering the universe."""
    for s in GICS_SECTORS:
        typer.echo(s)


# ---------------------------------------------------------------------------
# Serve + smoke
# ---------------------------------------------------------------------------


@app.command()
def serve(
    host: str = typer.Option("127.0.0.1", "--host"),
    port: int = typer.Option(8001, "--port", "-p"),
    reload: bool = typer.Option(False, "--reload"),
) -> None:
    """Start the Compass FastAPI app (the React UI talks to this in slice 19)."""
    import uvicorn

    typer.echo(f"Compass API starting at http://{host}:{port}")
    uvicorn.run("compass.api:app", host=host, port=port, reload=reload)


@app.command()
def ask(
    prompt: str = typer.Argument(..., help="Prompt to send to Claude."),
    model: str = typer.Option("claude-sonnet-4-6", "--model", "-m"),
) -> None:
    """Send a single prompt to Claude — back-compat smoke test for SDK + auth."""
    from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, TextBlock, query

    async def _one_shot() -> str:
        text_parts: list[str] = []
        async for message in query(prompt=prompt, options=ClaudeAgentOptions(model=model)):
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        text_parts.append(block.text)
        return "".join(text_parts).strip()

    try:
        typer.echo(asyncio.run(_one_shot()))
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)


@app.command()
def chat(
    message: str = typer.Argument(None, help="Message to send. Omit to start an interactive REPL."),
    analyst: str = typer.Option(
        None, "--analyst", "-a",
        help="Analyst slug to chat as (e.g. `maria-chen`). Omit to talk to the master agent.",
    ),
    model: str = typer.Option(
        "claude-sonnet-4-6", "--model", "-m",
        help="Model ID — Sonnet 4.6 / Haiku 4.5 / Opus 4.7.",
    ),
    extended_thinking: bool = typer.Option(
        False, "--extended", help="Enable extended thinking.",
    ),
) -> None:
    """Test the same chat path the UI uses, but from the terminal.

    Uses `compass.llm.generate_reply` — the exact function the FastAPI
    chat endpoint calls — so if this works, the UI's chat will too. Auth
    is OAuth-only (reads ~/.claude/.credentials.json).

    One-shot mode:
        compass chat "Hi"
        compass chat --analyst maria-chen "thoughts on NVDA today?"

    Interactive REPL (omit the message):
        compass chat
        compass chat --analyst maria-chen
    """
    from compass.chats import Session as ChatSession, Message as ChatMessage
    from compass.llm import generate_reply, OAuthUnavailable

    owner_key = analyst or "master"
    thinking = "extended" if extended_thinking else "standard"

    # In-memory session — not persisted. Each call carries the history
    # so far in the prompt the way the real API endpoint does.
    session = ChatSession(
        id="cli-chat", ownerKey=owner_key, taskId="cli-task",
        title="", lastMessageAt="", preview="",
        messages=[],
    )

    def _now() -> str:
        from datetime import datetime, timezone
        return datetime.now(timezone.utc).isoformat()

    def _new_id(prefix: str) -> str:
        import uuid
        return f"{prefix}-{uuid.uuid4().hex[:8]}"

    async def _one(user_text: str) -> None:
        session.messages.append(ChatMessage(id=_new_id("m"), role="pm", text=user_text, ts=_now()))
        try:
            reply = await generate_reply(
                owner_key, session,
                model=model,
                thinking=thinking,
            )
        except OAuthUnavailable as exc:
            typer.secho(f"\n[claude /login required] {exc}\n", fg=typer.colors.RED, err=True)
            sys.exit(2)
        except Exception as exc:  # noqa: BLE001
            typer.secho(f"\n[{type(exc).__name__}] {exc}\n", fg=typer.colors.RED, err=True)
            return
        session.messages.append(ChatMessage(id=_new_id("m"), role="master", text=reply, ts=_now()))
        typer.echo(reply)

    typer.secho(
        f"chat: owner={owner_key} · model={model} · thinking={thinking}",
        fg=typer.colors.BRIGHT_BLACK,
    )

    if message:
        asyncio.run(_one(message))
        return

    # Interactive REPL
    typer.secho("(Ctrl+C or empty line to exit.)\n", fg=typer.colors.BRIGHT_BLACK)
    try:
        while True:
            try:
                user_text = typer.prompt("you", default="", show_default=False)
            except (KeyboardInterrupt, EOFError):
                raise KeyboardInterrupt
            if not user_text.strip():
                break
            typer.secho("...", fg=typer.colors.BRIGHT_BLACK)
            asyncio.run(_one(user_text))
            typer.echo("")
    except KeyboardInterrupt:
        typer.secho("\nbye.", fg=typer.colors.BRIGHT_BLACK)


if __name__ == "__main__":
    app()
