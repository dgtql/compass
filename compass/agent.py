"""Compass agent — thin wrapper around claude-agent-sdk.

Slice 1: minimal ``ask(prompt) -> str`` to validate the SDK + auth path.
Slice 3: ``summarize(path, ticker)`` runs the agent with the Read tool
enabled and a ``PreToolUse`` hook that logs every tool call. The hook
is the seam Slice 4 swaps for the SQLite evidence-ledger writer.

Slice 2.5 (architectural pivot, 2026-05-12): SEC filings now arrive as
clean Markdown directly from ``edgartools`` (see ``compass.ingest.edgar``),
so this module no longer needs an HTML-pre-processing stage.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    HookMatcher,
    TextBlock,
    query,
)

from compass.tools import make_tool_logger

DEFAULT_MODEL = "claude-sonnet-4-6"


async def ask(
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    system_prompt: str | None = None,
) -> str:
    """Send a single prompt to Claude and return the final assistant text.

    Auth resolution is automatic:
    - If ``ANTHROPIC_API_KEY`` is set in the environment, the SDK uses it.
    - Otherwise the SDK falls back to Claude Code OAuth credentials
      (set up by running ``claude`` once and completing ``/login``).
    """
    options = ClaudeAgentOptions(model=model, system_prompt=system_prompt)

    text_parts: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_parts.append(block.text)

    return "".join(text_parts).strip()


async def summarize(
    path: Path,
    *,
    ticker: str | None = None,
    model: str = DEFAULT_MODEL,
) -> str:
    """Have the agent read ``path`` and return a one-paragraph summary.

    Inputs are expected to be reading-friendly (plain text or Markdown);
    EDGAR filings arrive in that shape via ``EdgarSource`` (edgartools'
    ``Filing.markdown()``), so we point the agent straight at the file.
    The PreToolUse hook in ``compass.tools.make_tool_logger`` observes
    every tool call and will write SQLite evidence-ledger rows in Slice 4.
    """
    abs_path = path.resolve()
    if not abs_path.exists():
        raise FileNotFoundError(f"document not found: {abs_path}")

    context_hint = f" for {ticker.upper()}" if ticker else ""
    prompt = (
        f"Read the document at {abs_path}{context_hint}. "
        "Then write a single paragraph (max ~150 words) summarizing the key "
        "facts a portfolio manager would care about: the business, recent "
        "financial results, material risks, and forward outlook. Ground every "
        "specific claim in the document — quote or cite phrasing where useful."
    )

    started_at = time.monotonic()
    print(
        f"[   0.0s] Reading {abs_path.name} ({abs_path.stat().st_size / 1024:.0f} KB) "
        f"with model {model}; expect ~30–60s on a 10-K.",
        flush=True,
        file=sys.stderr,
    )

    options = ClaudeAgentOptions(
        model=model,
        tools=["Read"],
        allowed_tools=["Read"],
        add_dirs=[str(abs_path.parent)],
        hooks={
            "PreToolUse": [HookMatcher(hooks=[make_tool_logger(started_at)])],
        },
        # Bound the loop so a misbehaving agent can't read a large document
        # forever. ~20 turns is room for one initial read, several paged
        # follow-ups on a 10-K, and the final response.
        max_turns=20,
    )

    text_parts: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_parts.append(block.text)

    elapsed = time.monotonic() - started_at
    print(f"[{elapsed:6.1f}s] done.", flush=True, file=sys.stderr)
    return "".join(text_parts).strip()
