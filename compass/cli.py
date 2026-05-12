"""Compass CLI entry point."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

import typer
from dotenv import load_dotenv

from compass import __version__
from compass.agent import DEFAULT_MODEL, ask as agent_ask, summarize as agent_summarize
from compass.ingest.edgar import EdgarConfigError, EdgarSource

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
    every tool call streams to stdout via a PreToolUse hook (Slice 4
    rewires this hook to write SQLite evidence-ledger rows).
    """
    try:
        text = asyncio.run(agent_summarize(path, ticker=ticker, model=model))
    except Exception as exc:  # noqa: BLE001
        typer.secho(f"Error: {exc}", fg=typer.colors.RED, err=True)
        sys.exit(1)
    typer.echo()
    typer.echo(text)


if __name__ == "__main__":
    app()
