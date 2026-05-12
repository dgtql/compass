"""Compass CLI entry point."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import typer
from dotenv import load_dotenv

from compass import __version__
from compass.agent import (
    DEFAULT_MODEL,
    ask as agent_ask,
    research as agent_research,
    summarize as agent_summarize,
)
from compass.db import get_evidence, list_evidence_for_ticker, recent_audit
from compass.ingest.edgar import EdgarConfigError, EdgarSource
from compass.ingest.yahoo import YahooSource

# Pick up ANTHROPIC_API_KEY (and friends) from a local .env if present.
# Has no effect if the variables are already set or the file doesn't exist.
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


@app.command()
def ask(
    prompt: str = typer.Argument(..., help="The prompt to send to Claude."),
    model: str = typer.Option(
        DEFAULT_MODEL,
        "--model",
        "-m",
        help="Model ID to use.",
    ),
) -> None:
    """Send a single prompt to Claude and print the response.

    Slice 1 smoke-test entry point. Validates package install, CLI wiring,
    Claude Agent SDK import, auth resolution (OAuth or API key), and that
    the async query loop completes.
    """
    try:
        answer = asyncio.run(agent_ask(prompt, model=model))
    except Exception as exc:  # noqa: BLE001 — surface everything in Slice 1
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)
    typer.echo(answer)


@app.command()
def fetch(
    ticker: str = typer.Argument(..., help="Ticker symbol (e.g. SOC)."),
    form: str = typer.Argument(..., help="SEC form type (e.g. 10-K, 10-Q, 8-K)."),
    limit: int = typer.Option(
        1,
        "--limit",
        "-n",
        help="Number of most-recent filings to fetch.",
    ),
) -> None:
    """Fetch SEC filings for a ticker into its workspace.

    Slice 2 entry point. Files land under
    ``data/tickers/<TICKER>_<EXCH>/corpus/sec-edgar-filings/<TICKER>/<FORM>/``.
    Requires COMPASS_SEC_USER_NAME and COMPASS_SEC_USER_EMAIL.
    """
    try:
        docs = EdgarSource().fetch(ticker, form_type=form, limit=limit)
    except EdgarConfigError as exc:
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(2)
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)

    if not docs:
        typer.secho(
            f"No {form} filings found for {ticker}.", fg=typer.colors.YELLOW
        )
        return

    typer.echo(f"Fetched {len(docs)} {form} filing(s) for {ticker}:")
    for doc in docs:
        typer.echo(f"  {doc.source_id}  →  {doc.local_path}")


@app.command()
def summarize(
    ticker: str = typer.Argument(..., help="Ticker for context (e.g. SOC)."),
    path: Path = typer.Argument(
        ...,
        help="Path to the document file to summarize (HTML or text).",
        exists=True,
        file_okay=True,
        dir_okay=False,
        resolve_path=True,
    ),
    model: str = typer.Option(
        DEFAULT_MODEL,
        "--model",
        "-m",
        help="Model ID to use.",
    ),
) -> None:
    """Have the agent read a document and print a one-paragraph summary.

    Slice 3 entry point. The agent uses the Read tool to load the file;
    every tool call streams to stderr via a PreToolUse hook and is also
    appended to the SQLite audit log (Slice 4) at compass.db's
    ``audit`` table.
    """
    try:
        text = asyncio.run(agent_summarize(path, ticker=ticker, model=model))
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)
    typer.echo()
    typer.echo(text)


@app.command()
def snapshot(
    ticker: str = typer.Argument(..., help="Ticker symbol (e.g. SOC)."),
) -> None:
    """Pull a Yahoo Finance market snapshot for a ticker into its workspace.

    Slice 7 entry point. Writes
    ``data/tickers/<TICKER>_<EXCH>/corpus/snapshots/yahoo/<YYYY-MM-DD>.md``
    with price, analyst consensus, recent financials, and top news
    headlines, and chunks the snapshot into the evidence ledger so memo
    skills can cite Yahoo data alongside EDGAR filings.
    """
    try:
        docs = YahooSource().fetch(ticker)
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)

    if not docs:
        typer.secho(
            f"No Yahoo data returned for {ticker.upper()}.",
            fg=typer.colors.YELLOW,
        )
        return

    typer.echo(f"Yahoo snapshot for {ticker.upper()}:")
    for doc in docs:
        typer.echo(f"  {doc.source_id}  →  {doc.local_path}")


@app.command()
def research(
    ticker: str = typer.Argument(..., help="Ticker symbol (e.g. SOC)."),
    type: str = typer.Option(
        "pitch",
        "--type",
        "-t",
        help="Memo type. Resolves to skills/<type>-memo/SKILL.md.",
    ),
    model: str = typer.Option(
        DEFAULT_MODEL,
        "--model",
        "-m",
        help="Model ID to use.",
    ),
) -> None:
    """Produce an analyst memo for a ticker using a Compass skill.

    Slice 6 entry point. Reads every fetched filing under the ticker's
    workspace, follows the corresponding `skills/<type>-memo/SKILL.md`,
    and writes the memo to `data/tickers/<TICKER>/memos/<type>/<date>.md`.
    Every specific claim cites an `evidence.id` from the ledger.

    Run `compass fetch <TICKER> 10-K` first to populate the corpus.
    """
    try:
        memo_path = asyncio.run(
            agent_research(ticker, memo_type=type, model=model)
        )
    except FileNotFoundError as exc:
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(2)
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)
    typer.echo()
    typer.echo(f"Memo written: {memo_path}")


# --- Slice 4: evidence ledger inspection -----------------------------------

evidence_app = typer.Typer(
    name="evidence",
    help="Inspect the SQLite evidence ledger and audit log.",
    no_args_is_help=True,
)
app.add_typer(evidence_app, name="evidence")


@evidence_app.command("list")
def evidence_list(
    ticker: str = typer.Argument(..., help="Ticker symbol (e.g. SOC)."),
    limit: int = typer.Option(20, "--limit", "-n", help="Max rows to show."),
) -> None:
    """List recent evidence chunks for a ticker."""
    rows = list_evidence_for_ticker(ticker, limit=limit)
    if not rows:
        typer.secho(f"No evidence rows for {ticker.upper()}.", fg=typer.colors.YELLOW)
        return
    typer.echo(f"{'ID':>5}  {'FORM':<6}  {'LINES':<12}  {'HASH':<14}  DOC")
    for r in rows:
        line_range = f"{r['line_start']}-{r['line_end']}"
        typer.echo(
            f"{r['id']:>5}  {r['form_type'] or '?':<6}  {line_range:<12}  "
            f"{r['text_hash'][:12]}…  {r['doc_id']}"
        )


@evidence_app.command("show")
def evidence_show(
    row_id: int = typer.Argument(..., help="Evidence row id (from `evidence list`)."),
) -> None:
    """Print the content of a single evidence chunk."""
    row = get_evidence(row_id)
    if row is None:
        typer.secho(f"No evidence row with id {row_id}.", fg=typer.colors.RED, err=True)
        sys.exit(1)
    typer.echo(
        f"# evidence#{row['id']}  {row['ticker']}  {row['form_type']}  "
        f"{row['doc_id']}  lines {row['line_start']}-{row['line_end']}"
    )
    typer.echo(f"# source_url: {row['source_url']}")
    typer.echo(f"# retrieved_at: {row['retrieved_at']}")
    typer.echo("")
    typer.echo(row["content"])


@evidence_app.command("audit")
def evidence_audit(
    limit: int = typer.Option(20, "--limit", "-n", help="Max rows to show."),
) -> None:
    """Show the most recent tool-call audit rows."""
    rows = recent_audit(limit=limit)
    if not rows:
        typer.secho("No audit rows yet.", fg=typer.colors.YELLOW)
        return
    typer.echo(f"{'ID':>5}  {'TS':<32}  {'TOOL':<8}  OFFSET  FILE")
    for r in rows:
        offset_part = (
            f"{r['offset_start']}-{r['offset_end']}"
            if r["offset_start"] is not None
            else "—"
        )
        file_part = r["file_path"] or ""
        if len(file_part) > 60:
            file_part = "…" + file_part[-58:]
        typer.echo(
            f"{r['id']:>5}  {r['ts']:<32}  {r['tool_name']:<8}  "
            f"{offset_part:<8}  {file_part}"
        )


if __name__ == "__main__":
    app()
