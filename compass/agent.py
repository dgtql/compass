"""Compass agent — thin wrapper around claude-agent-sdk.

Slice 1: minimal ``ask(prompt) -> str`` to validate the SDK + auth path.
Tools, streaming, sessions, skills, and the ``can_use_tool`` gate arrive
in later slices.
"""

from __future__ import annotations

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    TextBlock,
    query,
)

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

    Parameters
    ----------
    prompt:
        The user message to send.
    model:
        Model ID. Defaults to ``claude-sonnet-4-6``.
    system_prompt:
        Optional system prompt. Unused in Slice 1; wired through for later use.

    Returns
    -------
    str
        Concatenated text from all assistant ``TextBlock``s, stripped.
    """
    options = ClaudeAgentOptions(
        model=model,
        system_prompt=system_prompt,
    )

    text_parts: list[str] = []
    async for message in query(prompt=prompt, options=options):
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if isinstance(block, TextBlock):
                    text_parts.append(block.text)

    return "".join(text_parts).strip()
