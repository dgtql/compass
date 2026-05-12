"""Compass CLI entry point."""

from __future__ import annotations

import asyncio
import sys

import typer
from dotenv import load_dotenv

from compass import __version__
from compass.agent import DEFAULT_MODEL, ask as agent_ask

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


if __name__ == "__main__":
    app()
