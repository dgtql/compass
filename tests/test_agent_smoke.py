"""Smoke tests for the Compass agent layer.

These make real network calls to Claude. They auto-skip when no auth source
is available (no ``ANTHROPIC_API_KEY`` and no ``claude`` CLI on PATH).
"""

from __future__ import annotations

import os
import shutil

import pytest

from compass.agent import ask


def _auth_available() -> bool:
    """True if either an API key is in the env or Claude Code is installed."""
    if os.environ.get("ANTHROPIC_API_KEY"):
        return True
    if shutil.which("claude"):
        return True
    return False


pytestmark = pytest.mark.skipif(
    not _auth_available(),
    reason="No ANTHROPIC_API_KEY and no `claude` CLI on PATH.",
)


@pytest.mark.asyncio
async def test_ask_returns_arithmetic_answer() -> None:
    """Slice 1 smoke test: the agent answers a trivial math question.

    Validates: package imports, claude-agent-sdk import path, auth
    resolution (OAuth or API key), and that the async query loop completes
    and yields at least one assistant text block.
    """
    answer = await ask("What is 2+2? Reply with just the number.")
    assert answer, "agent returned an empty string"
    assert "4" in answer, f"expected '4' in response, got: {answer!r}"
