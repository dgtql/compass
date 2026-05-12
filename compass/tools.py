"""Tool-call observability for the Compass agent loop.

In Slice 3 this is a stdout logger that proves the gate is wired and fires
on every tool call. In Slice 4 the same hook will be replaced with one
that writes rows to the SQLite evidence ledger — same shape (a record per
tool call), different destination.

Why ``PreToolUse`` and not ``can_use_tool``: the SDK only invokes
``can_use_tool`` for tool calls that would otherwise prompt the user.
Tools auto-allowed via ``allowed_tools`` bypass it entirely. For evidence
logging we need to observe *every* tool call regardless of permission
state, which is exactly what a ``PreToolUse`` hook does.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any, Awaitable, Callable

from claude_agent_sdk import HookContext, PreToolUseHookInput

from compass.db import insert_audit

HookFn = Callable[
    [PreToolUseHookInput | dict[str, Any], str | None, HookContext],
    Awaitable[dict[str, Any]],
]

EventFn = Callable[[dict[str, Any]], None]


def make_tool_logger(
    started_at: float,
    *,
    session_id: str | None = None,
    on_event: EventFn | None = None,
) -> HookFn:
    """Return a PreToolUse hook that streams to stderr AND audits to SQLite
    AND (optionally) fires a callback the API layer can buffer for live UI.

    ``on_event`` receives a dict per tool call::

        {
            "ts": <wall-clock unix time>,
            "type": "tool",
            "elapsed": <seconds since ``started_at``>,
            "tool_name": "Read",
            "tool_input": {...},
            "preview": "Read file=…/foo offset=200 limit=300",
        }

    The hook itself is unchanged for CLI usage (``on_event=None``).
    """

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

        # Audit to SQLite. Read-specific fields get parsed out; other tools
        # land with file_path/offset NULL but the full tool_input is still
        # preserved in the JSON column so we don't lose information.
        file_path: str | None = None
        offset_start: int | None = None
        offset_end: int | None = None
        if isinstance(tool_input, dict):
            fp = tool_input.get("file_path")
            if isinstance(fp, str):
                file_path = fp
            off = tool_input.get("offset")
            lim = tool_input.get("limit")
            if isinstance(off, int):
                offset_start = off
                if isinstance(lim, int):
                    offset_end = off + lim
        try:
            insert_audit(
                tool_name=str(tool_name),
                tool_input_json=json.dumps(tool_input, default=str),
                file_path=file_path,
                offset_start=offset_start,
                offset_end=offset_end,
                session_id=session_id,
            )
        except Exception as exc:  # noqa: BLE001
            print(f"[audit] insert failed: {exc}", file=sys.stderr, flush=True)

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
                # Event delivery must never break the agent loop either.
                print(f"[event] callback failed: {exc}", file=sys.stderr, flush=True)
        return {}

    return hook


def _format_args(args: Any) -> str:
    """Render tool args so different calls are distinguishable in the log.

    File-path arguments get shortened to basename so the line stays short and
    the interesting bits (offset, limit, etc.) aren't hidden behind a 200-char
    absolute path.
    """
    if not isinstance(args, dict):
        text = repr(args)
        return text if len(text) <= 160 else text[:160] + "..."
    parts = []
    for key, value in args.items():
        if key == "file_path" and isinstance(value, str):
            parts.append(f"file=…/{value.rsplit(chr(92), 1)[-1].rsplit('/', 1)[-1]}")
        else:
            parts.append(f"{key}={value!r}")
    return " ".join(parts)
