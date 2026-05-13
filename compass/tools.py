"""Tool-call observability for agent-driven skills.

This is the PreToolUse hook used by skills that invoke the Claude Agent
SDK. It does two things:

1. Streams a short line per tool call to stderr so the CLI shows what the
   agent is doing in real time.
2. Appends a JSON line to the engagement's ``.pipeline/run.log`` (when an
   engagement is supplied) and/or fires a user callback.

Slice 18 dropped the SQLite audit table — the run log + the artifacts on
disk are the durable record now.

Why ``PreToolUse`` and not ``can_use_tool``: the SDK only invokes
``can_use_tool`` for tool calls that would otherwise prompt the user.
Tools auto-allowed via ``allowed_tools`` bypass it entirely. For
observability we need to see *every* tool call regardless of permission
state — that's what a ``PreToolUse`` hook does.
"""

from __future__ import annotations

import sys
import time
from typing import Any, Awaitable, Callable

from claude_agent_sdk import HookContext, PreToolUseHookInput

from compass.engagement import Engagement

HookFn = Callable[
    [PreToolUseHookInput | dict[str, Any], str | None, HookContext],
    Awaitable[dict[str, Any]],
]

EventFn = Callable[[dict[str, Any]], None]


def make_tool_logger(
    started_at: float,
    *,
    engagement: Engagement | None = None,
    session_id: str | None = None,
    on_event: EventFn | None = None,
) -> HookFn:
    """Return a PreToolUse hook that streams + logs + (optionally) callbacks."""

    async def hook(
        inp: PreToolUseHookInput | dict[str, Any],
        tool_use_id: str | None,
        ctx: HookContext,
    ) -> dict[str, Any]:
        tool_name = inp["tool_name"] if isinstance(inp, dict) else inp.tool_name
        tool_input = inp["tool_input"] if isinstance(inp, dict) else inp.tool_input
        elapsed = time.monotonic() - started_at
        preview = _format_args(tool_input)
        print(
            f"[{elapsed:6.1f}s] [tool] {tool_name} {preview}",
            flush=True,
            file=sys.stderr,
        )

        if engagement is not None:
            engagement.log_event(
                {
                    "type": "tool",
                    "elapsed": round(elapsed, 2),
                    "session_id": session_id,
                    "tool_name": str(tool_name),
                    "tool_input": tool_input if isinstance(tool_input, dict) else {"value": tool_input},
                }
            )

        if on_event is not None:
            try:
                on_event(
                    {
                        "ts": time.time(),
                        "type": "tool",
                        "elapsed": elapsed,
                        "tool_name": str(tool_name),
                        "tool_input": tool_input if isinstance(tool_input, dict) else {"value": tool_input},
                        "preview": f"{tool_name} {preview}",
                    }
                )
            except Exception as exc:  # noqa: BLE001
                print(f"[event] callback failed: {exc}", file=sys.stderr, flush=True)
        return {}

    return hook


def _format_args(args: Any) -> str:
    """Render tool args so different calls are distinguishable in the log."""
    if not isinstance(args, dict):
        text = repr(args)
        return text if len(text) <= 160 else text[:160] + "..."
    parts = []
    for key, value in args.items():
        if key == "file_path" and isinstance(value, str):
            short = value.replace("\\", "/").rsplit("/", 1)[-1]
            parts.append(f"file=…/{short}")
        else:
            text = repr(value)
            if len(text) > 80:
                text = text[:80] + "..."
            parts.append(f"{key}={text}")
    return " ".join(parts)
